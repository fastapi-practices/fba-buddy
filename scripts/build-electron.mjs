import * as esbuild from "esbuild"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

export async function buildElectron({
  root = projectRoot,
  build = esbuild.build,
} = {}) {
  const outputDirectory = path.join(root, "electron/dist")
  const common = {
    absWorkingDir: root,
    bundle: true,
    platform: "node",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
    logLevel: "info",
    write: false,
  }
  const results = await Promise.allSettled([
    build({
      ...common,
      entryPoints: ["electron/main.ts"],
      outdir: outputDirectory,
      format: "esm",
      packages: "external",
    }),
    build({
      ...common,
      entryPoints: ["electron/preload.ts"],
      outfile: path.join(outputDirectory, "preload.cjs"),
      format: "cjs",
    }),
  ])
  const failure = results.find((result) => result.status === "rejected")
  if (failure) throw failure.reason

  const staging = await mkdtemp(path.join(root, "electron/.dist-build-"))
  const backup = path.join(staging, "previous")
  let movedPrevious = false
  try {
    for (const result of results) {
      for (const file of result.value.outputFiles) {
        const destination = path.join(
          staging,
          path.relative(outputDirectory, file.path)
        )
        await mkdir(path.dirname(destination), { recursive: true })
        await writeFile(destination, file.contents)
      }
    }
    try {
      await rename(outputDirectory, backup)
      movedPrevious = true
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    try {
      await rename(staging, outputDirectory)
    } catch (error) {
      if (movedPrevious) await rename(backup, outputDirectory)
      throw error
    }
    if (movedPrevious) {
      await rm(path.join(outputDirectory, "previous"), {
        recursive: true,
        force: true,
      })
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await buildElectron()
}
