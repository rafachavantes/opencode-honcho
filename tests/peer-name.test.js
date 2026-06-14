import { expect, test, afterEach } from "bun:test"
import { __testing } from "../dist/index.js"

const original = { USER: process.env.USER, USERNAME: process.env.USERNAME }
afterEach(() => {
  process.env.USER = original.USER
  process.env.USERNAME = original.USERNAME
})

test("currentUserName prefers $USER", () => {
  process.env.USER = "rafa"
  delete process.env.USERNAME
  expect(__testing.currentUserName()).toBe("rafa")
})

test("currentUserName falls back to $USERNAME then 'user'", () => {
  delete process.env.USER
  process.env.USERNAME = "rafa-win"
  expect(__testing.currentUserName()).toBe("rafa-win")
  delete process.env.USERNAME
  expect(__testing.currentUserName()).toBe("user")
})
