const { existsSync } = require("node:fs")
const { join } = require("node:path")
const { spawnSync } = require("node:child_process")

const root = join(__dirname, "..")
const isWindows = process.platform === "win32"
const localTsgo = join(root, "node_modules", ".bin", isWindows ? "tsgo.cmd" : "tsgo")
const localTsc = join(root, "node_modules", ".bin", isWindows ? "tsc.cmd" : "tsc")

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 1)
}

if (existsSync(localTsgo)) {
  run(localTsgo, [])
}

console.warn("@typescript/native-preview is not installed locally; falling back to tsc --noEmit.")
run(localTsc, ["--noEmit"])