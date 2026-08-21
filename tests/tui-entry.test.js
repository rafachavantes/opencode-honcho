import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import tuiModule from "../dist/tui.js"

const withEnv = async (entries, action) => {
  const previous = new Map()
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }

  try {
    return await action()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }
      process.env[key] = value
    }
  }
}

test("package.json exposes an explicit OpenCode TUI entry", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"))

  expect(pkg.name).toBe("@rafachavantes/opencode-honcho")
  expect(pkg.exports["./tui"].import).toBe("./dist/tui.js")
})

test("tui entry default export matches OpenCode plugin expectations", () => {
  expect(tuiModule.id).toBe("@rafachavantes/opencode-honcho")
  expect(typeof tuiModule.tui).toBe("function")
})

test("HONCHO_ENABLED disables TUI command registration", async () => {
  for (const value of ["0", "false", "no", "off", "FaLsE"]) {
    let registerCalls = 0

    await withEnv({ HONCHO_ENABLED: value }, async () => {
      await tuiModule.tui({ command: { register: () => { registerCalls += 1 } } })
    })

    expect(registerCalls).toBe(0)
  }
})

test("the TUI registers commands when HONCHO_ENABLED is unset", async () => {
  let registerCalls = 0

  await withEnv({ HONCHO_ENABLED: undefined }, async () => {
    await tuiModule.tui({ command: { register: () => { registerCalls += 1 } } })
  })

  expect(registerCalls).toBe(1)
})

test("the TUI registers commands when HONCHO_ENABLED contains whitespace", async () => {
  let registerCalls = 0

  await withEnv({ HONCHO_ENABLED: " off" }, async () => {
    await tuiModule.tui({ command: { register: () => { registerCalls += 1 } } })
  })

  expect(registerCalls).toBe(1)
})
