import { createTwoFilesPatch } from "diff"
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointFile,
  WorkspaceGitDiff,
} from "@/shared/workspace"
import { workspaceGitDiffFiles } from "./workspace-git-diff-state"

function gitMode(mode = 0o644) {
  return (0o100000 | mode).toString(8)
}

function checkpointFilePatch(file: WorkspaceCheckpointFile) {
  if (file.before === null && file.after === null) return ""
  const header = `diff --git ${JSON.stringify(`a/${file.path}`)} ${JSON.stringify(`b/${file.path}`)}\n`
  const beforePath = file.before === null ? "/dev/null" : `a/${file.path}`
  const afterPath = file.after === null ? "/dev/null" : `b/${file.path}`
  let metadata = ""
  if (file.before === null) {
    metadata = `new file mode ${gitMode(file.afterMode)}\n`
  } else if (file.after === null) {
    metadata = `deleted file mode ${gitMode(file.mode)}\n`
  } else if (
    file.mode !== undefined &&
    file.afterMode !== undefined &&
    file.mode !== file.afterMode
  ) {
    metadata = `old mode ${gitMode(file.mode)}\nnew mode ${gitMode(file.afterMode)}\n`
  }
  if (file.before === file.after) return metadata ? header + metadata : ""
  if (file.encoding === "base64")
    return `${header}${metadata}Binary files ${beforePath} and ${afterPath} differ\n`
  return (
    header +
    metadata +
    createTwoFilesPatch(
      beforePath,
      afterPath,
      file.before ?? "",
      file.after ?? "",
      "",
      ""
    )
  )
}

export function checkpointGitDiff(
  checkpoint: WorkspaceCheckpoint
): WorkspaceGitDiff {
  const result: WorkspaceGitDiff = {
    repository: true,
    path: null,
    diff: (checkpoint.files ?? [checkpoint]).map(checkpointFilePatch).join(""),
    additions: 0,
    deletions: 0,
    truncated: false,
  }
  for (const file of workspaceGitDiffFiles(result)) {
    result.additions += file.additions
    result.deletions += file.deletions
  }
  return result
}
