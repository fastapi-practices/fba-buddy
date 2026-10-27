export const EXECUTION_MAX_FILE_BYTES = 1024 * 1024
export const EXECUTION_MAX_OUTPUT_BYTES = 2 * 1024 * 1024

// The helper retains an anchored cwd and never follows a path component or leaf symlink.
export const EXECUTION_FILE_HELPER = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX = 1024 * 1024;
const root = fs.realpathSync('.');
const c = fs.constants;
function inside() {
  const current = fs.realpathSync('.');
  const rel = path.relative(root, current);
  if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) throw Error('Path escapes workspace');
}
function info(name) {
  try { return fs.lstatSync(name); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function descend(name, create) {
  inside();
  let before = info(name);
  if (!before && create) {
    try { fs.mkdirSync(name, {mode: 0o755}); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    before = info(name);
  }
  if (!before || !before.isDirectory() || before.isSymbolicLink()) throw Error('Unsafe workspace directory');
  process.chdir(name);
  inside();
  const after = fs.statSync('.');
  if (before.dev !== after.dev || before.ino !== after.ino) throw Error('Workspace directory changed');
}
function leafPath(raw, create) {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\x00\r\n\\]/.test(raw)) throw Error('Invalid workspace path');
  if (raw === '.') return '.';
  const parts = raw.split('/');
  if (parts.some(p => !p || p === '..' || p === '.')) throw Error('Invalid workspace path');
  for (const part of parts.slice(0, -1)) descend(part, create);
  inside();
  return parts[parts.length - 1];
}
function regular(stats, maximum = MAX) {
  if (!stats.isFile() || stats.nlink !== 1) throw Error('Symlinks, hard links and special files are not allowed');
  if (stats.size > maximum) throw Error('File exceeds size limit');
}
function read(name) {
  const fd = fs.openSync(name, c.O_RDONLY | c.O_NOFOLLOW | c.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    regular(before);
    inside();
    const named = fs.lstatSync(name);
    if (named.isSymbolicLink() || named.dev !== before.dev || named.ino !== before.ino) throw Error('Workspace file changed');
    const buffer = Buffer.alloc(MAX + 1);
    let size = 0;
    while (size <= MAX) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > MAX) throw Error('File exceeds size limit');
    regular(fs.fstatSync(fd));
    return buffer.subarray(0, size).toString('utf8');
  } finally { fs.closeSync(fd); }
}
function write(name, text, maximum = MAX) {
  if (name === '.' || (typeof text !== 'string' && !Buffer.isBuffer(text)) || Buffer.byteLength(text) > maximum) throw Error('Content exceeds file size limit');
  inside();
  const old = info(name);
  if (old) {
    if (old.isSymbolicLink()) throw Error('Symlinks are not allowed');
    regular(old, maximum);
  }
  const temp = '.buddy-write-' + crypto.randomUUID();
  const fd = fs.openSync(temp, c.O_WRONLY | c.O_CREAT | c.O_EXCL | c.O_NOFOLLOW, 0o644);
  try {
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
    inside();
    const opened = fs.fstatSync(fd);
    const named = fs.lstatSync(temp);
    if (named.isSymbolicLink() || opened.ino !== named.ino || opened.dev !== named.dev || named.nlink !== 1) throw Error('Workspace file changed');
    fs.renameSync(temp, name);
  } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const p = request.params;
  const name = leafPath(p.path, request.method === 'write_file' || request.method === 'write_input_file');
  let text;
  let entries;
  if (request.method === 'list_files') {
    if (name !== '.') descend(name, false);
    const names = fs.readdirSync('.');
    if (names.length > 1000) throw Error('Directory exceeds entry limit');
    entries = [];
    for (const entry of names.sort()) {
      if (/[\r\n\x00]/.test(entry)) continue;
      const entryInfo = info(entry);
      if (!entryInfo || entryInfo.isSymbolicLink() || (!entryInfo.isFile() && !entryInfo.isDirectory())) continue;
      const relative = p.path === '.' ? entry : p.path + '/' + entry;
      entries.push({path: relative, is_dir: entryInfo.isDirectory(), size: entryInfo.isDirectory() ? null : entryInfo.size});
    }
  } else if (request.method === 'read_file') {
    const value = read(name);
    const start = p.offset || 0;
    if (p.line_numbers === false) {
      const lines = value.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
      if (lines.at(-1) === '') lines.pop();
      text = lines.slice(start, p.limit == null ? undefined : start + p.limit).join('');
    } else {
      const lines = value.split(/\r\n|\r|\n/);
      if (lines.at(-1) === '') lines.pop();
      text = lines.slice(start, p.limit == null ? undefined : start + p.limit).map((line, i) => (start + i + 1) + '\t' + line).join('\n');
    }
  } else if (request.method === 'write_input_file') {
    if (!/^inbound\/[a-f0-9]{64}-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(p.path) || typeof p.content_base64 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256)) throw Error('Invalid input file');
    const bytes = Buffer.from(p.content_base64, 'base64');
    if (bytes.length > 10 * 1024 * 1024 || bytes.toString('base64') !== p.content_base64 || crypto.createHash('sha256').update(bytes).digest('hex') !== p.sha256 || !p.path.startsWith('inbound/' + p.sha256 + '-')) throw Error('Invalid input file content');
    write(name, bytes, 10 * 1024 * 1024);
    text = JSON.stringify({path: p.path, size: bytes.length, sha256: p.sha256});
  } else if (request.method === 'write_file') {
    write(name, p.content);
    text = '\u5df2\u5199\u5165 ' + p.path;
  } else if (request.method === 'edit_file') {
    if (typeof p.old_text !== 'string' || !p.old_text || typeof p.new_text !== 'string') throw Error('Invalid edit text');
    const original = read(name);
    const index = original.indexOf(p.old_text);
    if (index < 0) throw Error('Text to replace was not found');
    if (original.indexOf(p.old_text, index + p.old_text.length) >= 0) throw Error('Text to replace must be unique');
    write(name, original.slice(0, index) + p.new_text + original.slice(index + p.old_text.length));
    text = '\u5df2\u7f16\u8f91 ' + p.path;
  } else throw Error('Unknown file operation');
  process.stdout.write(JSON.stringify({ok: true, text, entries}));
} catch (error) {
  process.stdout.write(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
`
