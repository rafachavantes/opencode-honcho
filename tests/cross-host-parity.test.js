import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { __testing } from "../dist/index.js"

// ---- config flag plumbing ----

test("new parity flags default to preserve opencode behavior", () => {
  expect(__testing.defaultSettings.userPeerPrefix).toBe(true)
  expect(__testing.defaultSettings.sessionNaming).toBe("opencode")
  expect(__testing.defaultSettings.sessionPeerPrefix).toBe(true)
})

test("sessionNaming rejects unknown values, accepts shared", () => {
  expect(() => __testing.parseSettingValue("sessionNaming", "bogus")).toThrow()
  expect(__testing.parseSettingValue("sessionNaming", "shared")).toBe("shared")
  expect(__testing.parseSettingValue("sessionNaming", "opencode")).toBe("opencode")
})

test("userPeerPrefix / sessionPeerPrefix coerce booleans from strings", () => {
  expect(__testing.parseSettingValue("userPeerPrefix", "false")).toBe(false)
  expect(__testing.parseSettingValue("sessionPeerPrefix", "false")).toBe(false)
  expect(__testing.parseSettingValue("userPeerPrefix", "true")).toBe(true)
})

test("all three new fields are settable host-scoped paths", () => {
  const target = {}
  __testing.setSettingValue(target, "userPeerPrefix", false)
  __testing.setSettingValue(target, "sessionNaming", "shared")
  __testing.setSettingValue(target, "sessionPeerPrefix", false)
  expect(target.hosts.opencode.userPeerPrefix).toBe(false)
  expect(target.hosts.opencode.sessionNaming).toBe("shared")
  expect(target.hosts.opencode.sessionPeerPrefix).toBe(false)
})

test("status field list includes the parity flags", () => {
  expect(__testing.statusFields).toContain("userPeerPrefix")
  expect(__testing.statusFields).toContain("sessionNaming")
  expect(__testing.statusFields).toContain("sessionPeerPrefix")
})

// ---- user peer id ----

test("deriveUserPeerId keeps the prefix by default (opencode scheme; normalizeId maps ':' -> '-')", () => {
  expect(__testing.deriveUserPeerId("rafa", true)).toBe("user-rafa")
})

test("deriveUserPeerId drops the prefix when opted in (claude/codex parity)", () => {
  expect(__testing.deriveUserPeerId("rafa", false)).toBe("rafa")
})

// ---- shared session name (must match claude/codex `<peer>-<repo>`) ----

test("deriveSharedSessionName produces <peer>-<repo> (parity with claude/codex)", () => {
  expect(__testing.deriveSharedSessionName("rafa", "honcho-install", true)).toBe("rafa-honcho-install")
})

test("deriveSharedSessionName drops the peer prefix when sessionPeerPrefix=false", () => {
  expect(__testing.deriveSharedSessionName("rafa", "honcho-install", false)).toBe("honcho-install")
})

test("deriveSharedSessionName sanitizes repo + peer consistently", () => {
  // EstateMap.AI repo dir -> lowercased, non [a-z0-9_-] collapsed to '-'
  expect(__testing.deriveSharedSessionName("rafa", "EstateMap.AI", true)).toBe("rafa-estatemap-ai")
})

// ---- deriveProjectRoot: a useless worktree="/" must not win over a real directory ----
// (regression: a non-git project + worktree="/" produced rootDir="/" -> session "rafa-default")

test("deriveProjectRoot prefers a real (non-git) directory over worktree='/'", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ocx-root-"))
  const root = __testing.deriveProjectRoot({ directory: dir, worktree: "/" })
  expect(root).toBe(path.resolve(dir))
  expect(path.basename(root)).not.toBe("")
})

test("deriveProjectRoot never returns the filesystem root", () => {
  const root = __testing.deriveProjectRoot({ directory: "/", worktree: "/" })
  expect(root).not.toBe(path.parse(process.cwd()).root)
  expect(path.basename(root)).not.toBe("")
})
