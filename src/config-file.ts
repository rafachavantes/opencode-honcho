import { randomUUID } from "node:crypto"
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

// ponytail: atomic replacement does not serialize concurrent writers; add a cross-process lock only if concurrent config edits become a supported workflow.
export const writeJsonFileAtomic = async (configPath: string, value: unknown, secureDirectory = false) => {
  const directory = path.dirname(configPath)
  const temporaryPath = path.join(directory, `.${path.basename(configPath)}.${randomUUID()}.tmp`)

  await mkdir(directory, { recursive: true })
  if (secureDirectory) {
    await chmod(directory, 0o700)
  }
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    await rename(temporaryPath, configPath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}
