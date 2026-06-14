import { expect, test } from "bun:test"
import { __testing } from "../dist/index.js"

test("dialectic enabled when flag is true (default)", () => {
  expect(__testing.dialecticEnabledFor({ sessionStartDialectic: true })).toBe(true)
})

test("dialectic disabled when flag is false", () => {
  expect(__testing.dialecticEnabledFor({ sessionStartDialectic: false })).toBe(false)
})
