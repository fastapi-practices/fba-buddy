import { listCheckpoints, readCheckpoint } from "./workspace-checkpoints"
import { workspaceExecutionActive } from "./workspace-run"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { afterEach, expect, it } from "vitest"
import { WebSocketServer } from "ws"
import {
  resolveLocalLaunch,
  prepareLocalAcp,
  setAcpWorkspaceDir,
  startLocalAcp,
  stopLocalAcp,
  stopLocalAcps,
} from "./local-acp"

const directories: string[] = []
afterEach(async () => {
  setAcpWorkspaceDir(undefined)
  await stopLocalAcps()
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

it("rejects a relative workspace and a missing local command", async () => {
  await expect(
    resolveLocalLaunch({ command: "agent", args: [] }, "relative")
  ).rejects.toThrow("工作目录")
  await expect(
    resolveLocalLaunch(
      { command: "not-an-installed-buddy-agent", args: [] },
      tmpdir()
    )
  ).rejects.toThrow("本机未找到")
})

it("runs the installed program in the local directory and terminates it on remote close", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "buddy-acp-"))
  directories.push(
    cwd,
    path.join(cwd, "../", path.basename(cwd) + "-checkpoints")
  )
  setAcpWorkspaceDir(cwd)
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" })
  await once(server, "listening")
  const address = server.address()
  if (typeof address !== "object" || !address)
    throw new Error("no server address")
  const bridgeId = "a".repeat(32)
  const connected = once(server, "connection")
  const script = `
    const fs = require('node:fs');
    fs.writeFileSync('started.json', JSON.stringify({cwd:process.cwd(),pid:process.pid,home:process.env.HOME}));
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', data => process.stdout.write(data));
    setInterval(()=>{},1000);
  `
  const start = startLocalAcp(
    {
      preparationId: prepareLocalAcp({
        owner: 1,
        account: "account",
        checkpointDirectory: path.join(
          cwd,
          "../",
          path.basename(cwd) + "-checkpoints"
        ),
        config: {
          command: process.execPath,
          args: ["-e", script],
          cwd,
        },
      }).preparationId,
      bridgeId,
      ticket: "t".repeat(40),
      url: `ws://127.0.0.1:${address.port}/api/v1/acp/bridges/${bridgeId}`,
      config: { command: "invalid-tampered-command", args: [], cwd: "/wrong" },
    },
    1,
    "account"
  )
  const [socket] = await connected
  try {
    const [auth] = await once(socket, "message")
    expect(JSON.parse(String(auth))).toEqual({ ticket: "t".repeat(40) })
    socket.send(JSON.stringify({ type: "ready" }))
    await start
    expect(
      workspaceExecutionActive(
        await import("node:fs/promises").then((fs) => fs.realpath(cwd))
      )
    ).toBe(true)
    const received = once(socket, "message")
    socket.send(JSON.stringify({ type: "stdin", data: '{"id":1}\n' }))
    const [data] = await received
    expect(JSON.parse(String(data))).toEqual({
      type: "stdout",
      data: '{"id":1}\n',
    })
    const local = JSON.parse(
      await readFile(path.join(cwd, "started.json"), "utf8")
    )
    expect(await readFile(path.join(cwd, "started.json"), "utf8")).toContain(
      process.env.HOME!
    )
    expect(local.cwd).toBe(
      await import("node:fs/promises").then((fs) => fs.realpath(cwd))
    )
    // 其他窗口不能关闭这个窗口的 Agent
    await stopLocalAcp(bridgeId, 2)
    expect(() => process.kill(local.pid, 0)).not.toThrow()
    socket.send(JSON.stringify({ type: "close" }))
    await once(socket, "close")
    await expect
      .poll(() => {
        try {
          process.kill(local.pid, 0)
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
  } finally {
    await stopLocalAcp(bridgeId)
    const root = await import("node:fs/promises").then((fs) => fs.realpath(cwd))
    expect(workspaceExecutionActive(root)).toBe(false)
    const checkpoints = await listCheckpoints(
      path.join(cwd, "../", path.basename(cwd) + "-checkpoints"),
      root
    )
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]).toMatchObject({ kind: "turn", fileCount: 1 })
    const snapshot = await readCheckpoint(
      path.join(cwd, "../", path.basename(cwd) + "-checkpoints"),
      root,
      checkpoints[0].id
    )
    expect(snapshot.files?.[0]).toMatchObject({
      path: "started.json",
      before: null,
    })
    socket.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it("cancels initialization before a local process can start", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "buddy-acp-cancel-"))
  directories.push(cwd)
  setAcpWorkspaceDir(cwd)
  const bridgeId = "c".repeat(32)
  const started = startLocalAcp(
    {
      preparationId: prepareLocalAcp({
        owner: 3,
        account: "account",
        config: { command: process.execPath, args: [], cwd },
      }).preparationId,
      bridgeId,
      ticket: "t".repeat(40),
      url: `ws://127.0.0.1:1/api/v1/acp/bridges/${bridgeId}`,
      config: { command: process.execPath, args: [], cwd: tmpdir() },
    },
    3,
    "account"
  )
  await stopLocalAcp(bridgeId, 3)
  await expect(started).rejects.toThrow("启动已取消")
})

it("forwards the installed agent's exit code to the backend bridge", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "buddy-acp-exit-"))
  directories.push(cwd)
  setAcpWorkspaceDir(cwd)
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" })
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address !== "object")
    throw new Error("no server address")
  const bridgeId = "e".repeat(32)
  const connected = once(server, "connection")
  const started = startLocalAcp(
    {
      preparationId: prepareLocalAcp({
        owner: 1,
        account: "account",
        config: {
          command: process.execPath,
          args: ["-e", "process.stdin.on('data', () => process.exit(23))"],
          cwd,
        },
      }).preparationId,
      bridgeId,
      ticket: "t".repeat(40),
      url: `ws://127.0.0.1:${address.port}/api/v1/acp/bridges/${bridgeId}`,
      config: {
        command: process.execPath,
        args: ["-e", "process.stdin.on('data', () => process.exit(23))"],
        cwd,
      },
    },
    1,
    "account"
  )
  const [socket] = await connected
  try {
    await once(socket, "message")
    socket.send(JSON.stringify({ type: "ready" }))
    await started
    const exited = once(socket, "message")
    socket.send(JSON.stringify({ type: "stdin", data: "exit\n" }))
    const [event] = await exited
    expect(JSON.parse(String(event))).toEqual({ type: "exit", code: 23 })
  } finally {
    await stopLocalAcp(bridgeId)
    socket.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it("rejects a preparation from another owner/account and never accepts an unprepared launch", async () => {
  const config = { command: process.execPath, args: [], cwd: tmpdir() }
  const { preparationId } = prepareLocalAcp({
    owner: 1,
    account: "first",
    config,
  })
  const payload = {
    bridgeId: "f".repeat(32),
    ticket: "t".repeat(40),
    url: `ws://127.0.0.1:1/api/v1/acp/bridges/${"f".repeat(32)}`,
    config,
    preparationId,
  }
  await expect(startLocalAcp(payload, 2, "first")).rejects.toThrow("准备已过期")
  await expect(startLocalAcp(payload, 1, "second")).rejects.toThrow(
    "准备已过期"
  )
  await expect(
    startLocalAcp({ ...payload, preparationId: undefined }, 1, "first")
  ).rejects.toThrow("准备已过期")
})
