import { expect, test } from "bun:test"
import { __testing } from "../dist/index.js"

function makeRuntime(contextScope) {
  return {
    config: { contextScope, recallMode: "hybrid", sessionStrategy: "per-directory" },
    userPeerId: "user-rafa",
    userPeer: {
      context: async () => ({ representation: "GLOBAL_REP_LEAK", peerCard: ["card-line"] }),
      card: async () => ["card-line"],
    },
    agentPeer: {
      context: async () => ({ representation: "AGENT_GLOBAL_REP", peerCard: null }),
    },
    session: {
      context: async () => ({ summary: "SESSION_SUMMARY", peerRepresentation: "SCOPED_REP" }),
      summaries: async () => ({ shortSummary: "SESSION_SUMMARY", longSummary: "" }),
    },
  }
}

test("global scope returns the global peer representation (today's behavior)", async () => {
  const out = await __testing.buildScopedContext(makeRuntime("global"), "session-start")
  expect(out.representation).toBe("GLOBAL_REP_LEAK")
  expect(out.peerCard).toEqual(["card-line"])
})

test("session scope drops representation but keeps summary + peerCard (no bleed)", async () => {
  const out = await __testing.buildScopedContext(makeRuntime("session"), "session-start")
  expect(out.representation).toBe("")
  expect(out.summary).toBe("SESSION_SUMMARY")
  expect(out.peerCard).toEqual(["card-line"])
})

test("session scope prompt phase returns scoped summary, no representation", async () => {
  const out = await __testing.buildScopedContext(makeRuntime("session"), "prompt")
  expect(out.representation).toBe("")
  expect(out.summary).toBe("SESSION_SUMMARY")
})

test("session scope never surfaces the global representation string", async () => {
  const start = await __testing.buildScopedContext(makeRuntime("session"), "session-start")
  const prompt = await __testing.buildScopedContext(makeRuntime("session"), "prompt", "anything")
  for (const out of [start, prompt]) {
    expect(out.representation).not.toContain("GLOBAL_REP_LEAK")
    expect(out.representation).not.toContain("AGENT_GLOBAL_REP")
    expect(out.representation).not.toContain("SCOPED_REP")
  }
})

test("session summary is clamped to a bounded length", async () => {
  const runtime = {
    config: { contextScope: "session", recallMode: "hybrid" },
    userPeerId: "u",
    userPeer: { context: async () => ({ peerCard: ["c"] }) },
    agentPeer: { context: async () => ({}) },
    session: {
      context: async () => ({ summary: "x".repeat(5000), peerRepresentation: "" }),
      summaries: async () => ({}),
    },
  }
  const out = await __testing.buildScopedContext(runtime, "prompt", "q")
  expect(out.summary.length).toBeLessThanOrEqual(2000)
})
