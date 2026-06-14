import { expect, test } from "bun:test"
import { __testing } from "../dist/index.js"

test("getOrCreate builds once per key and reuses the result", async () => {
  let builds = 0
  const cache = __testing.createRuntimeCache(async () => {
    builds += 1
    return { id: builds }
  })
  const a = await cache.getOrCreate("k", {})
  const b = await cache.getOrCreate("k", {})
  expect(builds).toBe(1)
  expect(a).toBe(b)
})

test("concurrent getOrCreate for the same key shares one build", async () => {
  let builds = 0
  const cache = __testing.createRuntimeCache(async () => {
    builds += 1
    await new Promise((r) => setTimeout(r, 10))
    return { id: builds }
  })
  const [a, b] = await Promise.all([cache.getOrCreate("k", {}), cache.getOrCreate("k", {})])
  expect(builds).toBe(1)
  expect(a).toBe(b)
})

test("evict forces a rebuild on next call", async () => {
  let builds = 0
  const cache = __testing.createRuntimeCache(async () => ({ id: ++builds }))
  await cache.getOrCreate("k", {})
  cache.evict("k")
  await cache.getOrCreate("k", {})
  expect(builds).toBe(2)
})

test("a rejected build is not cached", async () => {
  let builds = 0
  const cache = __testing.createRuntimeCache(async () => {
    builds += 1
    if (builds === 1) throw new Error("boom")
    return { id: builds }
  })
  await expect(cache.getOrCreate("k", {})).rejects.toThrow("boom")
  const ok = await cache.getOrCreate("k", {})
  expect(ok.id).toBe(2)
})

test("LRU cap evicts the oldest entry", async () => {
  const cache = __testing.createRuntimeCache(async (input) => ({ key: input.key }), { maxEntries: 2 })
  await cache.getOrCreate("a", { key: "a" })
  await cache.getOrCreate("b", { key: "b" })
  await cache.getOrCreate("c", { key: "c" })
  expect(cache.size()).toBe(2)
})

test("isNotFoundError detects 404 by status and by message", () => {
  expect(__testing.isNotFoundError({ status: 404 })).toBe(true)
  expect(__testing.isNotFoundError(new Error("HTTP 404: missing"))).toBe(true)
  expect(__testing.isNotFoundError(new Error("HTTP 500"))).toBe(false)
  expect(__testing.isNotFoundError(null)).toBe(false)
})
