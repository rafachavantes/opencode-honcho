import { expect, test } from "bun:test"
import { __testing } from "../dist/index.js"

test("contextScope defaults to global (preserves upstream behavior)", () => {
  expect(__testing.defaultSettings.contextScope).toBe("global")
})

test("sessionStartDialectic defaults to true (preserves upstream behavior)", () => {
  expect(__testing.defaultSettings.sessionStartDialectic).toBe(true)
})

test("contextScope rejects unknown values", () => {
  expect(() => __testing.parseSettingValue("contextScope", "bogus")).toThrow()
  expect(__testing.parseSettingValue("contextScope", "session")).toBe("session")
})

test("sessionStartDialectic coerces booleans from strings", () => {
  expect(__testing.parseSettingValue("sessionStartDialectic", "false")).toBe(false)
  expect(__testing.parseSettingValue("sessionStartDialectic", "true")).toBe(true)
})

test("both new fields are settable host-scoped paths", () => {
  const target = {}
  __testing.setSettingValue(target, "contextScope", "session")
  __testing.setSettingValue(target, "sessionStartDialectic", false)
  expect(target.hosts.opencode.contextScope).toBe("session")
  expect(target.hosts.opencode.sessionStartDialectic).toBe(false)
})
