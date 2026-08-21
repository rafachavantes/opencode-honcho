# Kill Switch and Config Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-invocation `HONCHO_ENABLED` kill switch and make every
shared Honcho configuration write explicit, atomic, and private without
changing enabled runtime behavior.

**Architecture:** Stage 1 uses two tiny entry-point guards: the runtime
factory returns `{}` before allocating any state and the separate TUI entry
does not register commands. Stage 2 centralizes the one non-trivial operation
that both entries need—a same-directory temporary-file write followed by an
atomic rename—in a small internal module. Native tools gate sensitive writes
before runtime derivation; existing TUI confirmations remain the UI consent
mechanism.

**Tech Stack:** TypeScript (ES2022), Bun test runner, Node standard-library
filesystem APIs, `@opencode-ai/plugin`.

**Reference design:** `docs/specs/2026-08-21-kill-switch-and-config-safety-design.md`

---

## Delivery boundaries

1. **Kill switch:** source, README, rebuilt `dist/`, focused tests, then commit
   `feat: add one-shot Honcho kill switch`.
2. **Config safety:** source, README, rebuilt `dist/`, focused tests, then
   commit `feat: make Honcho config writes safe`.

Do not add MCP plumbing, persistent enablement settings, CLI flags,
dependencies, queues, retries, or session-identity changes. `dist/` is
gitignored, but it must be regenerated after each delivery because
`package.json` loads `./dist/index.js`.

## Baseline and shared verification

- [ ] **0. Restore the declared toolchain and record the test baseline.**

  **Files:** no source changes expected.

  1. Confirm the only tracked work before planning is the approved design and
     plan documents:

     ```sh
     git status --short --branch
     ```

  2. Restore the lockfile-pinned dependencies without changing lockfiles:

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun install --frozen-lockfile
     ```

  3. Run the exit gate once and save the exact output in the implementation
     notes. The documented environment-dependent failure in
     `tests/honcho-setup.test.js` is a baseline issue, not part of either
     delivery; do not loosen an assertion to hide it.

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run check
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test ./tests
     ```

  **Expected:** TypeScript and build succeed. If the full suite still has the
  documented real-`HOME` failure, retain that exact failure as the baseline;
  all focused tests added below must pass.

## Delivery 1 — one-shot kill switch

- [ ] **1. Add failing coverage for the disabled runtime and TUI entry.**

  **Files:**
  - Modify: `tests/honcho-setup.test.js`
  - Modify: `tests/tui-entry.test.js`

  1. In `tests/honcho-setup.test.js`, extend the filesystem import with
     `existsSync` from `node:fs` and add a small harness that accepts a log
     spy and a `configPath` override. It must not perform any setup action;
     it only invokes `createHonchoRuntimePlugin({ configPath })`.

  2. Add a table-driven test for `"0"`, `"false"`, `"no"`, `"off"`, and a
     mixed-case falsy spelling. For every value, use `withEnv` to set
     `HONCHO_ENABLED`, make the overridden config path invalid by creating a
     regular file where its parent directory would be, and install a mocked
     `fetch` that increments a counter. Assert all of the following:

     ```ts
     expect(hooks).toEqual({})
     expect(logCalls).toBe(0)
     expect(fetchCalls).toBe(0)
     expect(existsSync(sharedConfigPath)).toBe(false)
     ```

     This proves that the factory does not register tools or hooks, touch the
     config path, log, or make an HTTP request. Keep the test isolated with a
     temporary `HOME` and restore every environment value in `finally` via
     the existing `withEnv` helper.

  3. Add the complementary enabled-default assertion with `HONCHO_ENABLED`
     unset and with a truthy non-special value such as `"yes"`. Assert the
     returned object exposes the existing `event` hook and
     `tool.honcho_status`; do not invoke a tool or write config merely to
     prove registration.

  4. In `tests/tui-entry.test.js`, add the local `withEnv` helper and call
     the public `tuiModule.tui` function with the minimal registration spy:

     ```ts
     let registerCalls = 0
     await tuiModule.tui({ command: { register: () => { registerCalls += 1 } } } as never)
     expect(registerCalls).toBe(0)
     ```

     Run it for one falsy value and add an unset-variable companion that
     expects one registration. This tests the entry point rather than the
     exported `buildCommands` helper, whose command list should remain
     unchanged when enabled.

  5. Rebuild and run only the affected tests. They must fail because neither
     entry currently checks `HONCHO_ENABLED`.

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/honcho-setup.test.js tests/tui-entry.test.js
     ```

  **Expected failure:** disabled runtime still has hooks and disabled TUI
  still calls `command.register`.

- [ ] **2. Implement the two early-return guards and document the switch.**

  **Files:**
  - Modify: `src/index.ts`
  - Modify: `src/tui.ts`
  - Modify: `README.md`
  - Regenerate: `dist/index.js`, `dist/index.d.ts`, `dist/tui.js`

  1. In `src/index.ts`, add one local predicate near the runtime constants;
     it must lower-case the launching process environment and return
     `false` only for the specified falsy values:

     ```ts
     const honchoEnabled = () => !["0", "false", "no", "off"].includes(
       (process.env.HONCHO_ENABLED || "").toLowerCase(),
     )
     ```

     Do not create a module for this predicate.

  2. Make this the literal first executable statement inside the async body
     of `createHonchoRuntimePlugin`, before `sessionStates`, `runtimeCache`,
     logging closures, or any runtime helper can be reached:

     ```ts
     if (!honchoEnabled()) return {}
     ```

  3. In `src/tui.ts`, add the same small local predicate and place the same
     guard as the first statement in `const tui: TuiPlugin = async (api) =>`:

     ```ts
     if (!honchoEnabled()) return
     ```

     Leave `buildCommands` intact: enabled behavior and its current unit test
     remain unchanged.

  4. In `README.md`, add a concise **Disable for one run** section after
     Quick Start that documents the unset-variable default and includes these
     exact usage lines:

     ```sh
     HONCHO_ENABLED=false opencode run ...
     opencode run ...
     ```

     Mention the accepted falsy spellings (`0`, `false`, `no`, `off`) and
     that the setting is not persisted.

  5. Build and rerun the focused tests from Task 1. Then execute the complete
     gate and inspect the generated bundle for the guard:

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run check
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/honcho-setup.test.js tests/tui-entry.test.js
     PATH="/home/rafa/.bun/bin:$PATH" bun test ./tests
     rg -n 'HONCHO_ENABLED|honchoEnabled' dist/index.js dist/tui.js README.md
     ```

  **Expected:** all new focused assertions pass. The full-suite result is
  either green or exactly the known baseline failure from Task 0.

- [ ] **3. Review Delivery 1 and create its isolated commit.**

  **Files:** only the tracked stage-1 files from Task 2. `dist/` remains a
  locally rebuilt, ignored runtime artifact.

  1. Check the diff for accidental behavior changes or generated-file drift:

     ```sh
     git diff --check
     git diff -- src/index.ts src/tui.ts README.md tests/honcho-setup.test.js tests/tui-entry.test.js
     git status --short
     ```

  2. Verify that no config helper or confirmation work has entered this
     commit. Commit only the stage-1 change:

     ```sh
     git add README.md src/index.ts src/tui.ts tests/honcho-setup.test.js tests/tui-entry.test.js
     git commit -m "feat: add one-shot Honcho kill switch"
     ```

  **Expected:** a standalone commit whose disabled path is fully inert and
  whose absent-variable path retains the existing plugin behavior.

## Delivery 2 — confirmation and safe shared-config writes

- [ ] **4. Add failing tests for native confirmation, object validation, and file permissions.**

  **Files:**
  - Modify: `tests/honcho-setup.test.js`

  1. Import `chmod` and `stat` from `node:fs/promises`. Update every existing
     `honcho_setup` invocation that must reach its current behavior with
     `confirm: true`: successful cloud setup, unwritable-config failure,
     invalid-cloud-auth failure, default-cloud no-key response, and
     self-hosted setup. Leave confirmation absent only in the new negative
     cases below.

  2. Add a table-driven test where `honcho_setup` receives an API key without
     `confirm: true`, once with default `persistGlobal` and once with
     `persistGlobal: false`. With an empty temporary `HOME`, a fetch spy, and
     a log spy, assert a structured `{ ok: false }` confirmation error, zero
     fetch and log calls, and no `~/.honcho/config.json` creation. This
     assertion must precede runtime derivation, since derivation currently
     bootstraps the file.

  3. Add a separate empty-`HOME` test for an unconfirmed sensitive
     `honcho_set_config` call (use `workspace`). Supply log and fetch spies,
     then assert its structured confirmation error, zero log/fetch calls, and
     no `~/.honcho/config.json` creation. This is the proof that the guard is
     before `deriveRuntimeHandle`, not merely before the final write.

  4. Add a table-driven `honcho_set_config` test for every sensitive field:

     ```ts
     ["apiKey", "baseUrl", "workspace", "peerName", "aiPeer",
      "sessionStrategy", "sessionNaming", "sessionPeerPrefix", "userPeerPrefix"]
     ```

     Seed a valid config, retain its original bytes, invoke without
     `confirm`, then assert a structured confirmation error and byte-for-byte
     unchanged content. Add one confirmed sensitive write (for example,
     `workspace`) and assert it persists. Keep the existing `recallMode`
     test unconfirmed to prove non-sensitive fields retain direct editing.

  5. Before each successful native setup and native `honcho_set_config`
     permission assertion, seed a valid config and explicitly set its mode to
     `0644` using `chmod`. Then require the replacement to be private:

     ```ts
     expect((await stat(sharedConfigPath)).mode & 0o777).toBe(0o600)
     ```

     Also retain assertions for unrelated config fields, proving a complete
     JSON object—not only the changed field—is safely replaced.

  6. Add two native-writer preservation tests: seed malformed JSON and a
     top-level array separately, invoke confirmed setup and confirmed
     `honcho_set_config`, assert the setup structured failure and the
     `honcho_set_config` rejected promise respectively, and assert the
     original file bytes remain unchanged. Do not accept an array as an empty
     configuration.

  7. Add an atomic-failure preservation test through confirmed
     `honcho_set_config`: seed a valid config and remember its exact bytes,
     change the containing `.honcho` directory to `0500`, then invoke a
     confirmed sensitive update. The current direct writer can still truncate
     the existing writable file, while the safe writer must fail creating its
     same-directory temporary file. Assert rejection and byte-for-byte
     preservation; restore the directory to `0700` in `finally` before test
     cleanup.

  8. Build and run the focused file. These tests must fail: confirmation is
     currently ignored, the runtime accepts arrays, direct writes preserve
     `0644` permissions, or a failed replacement mutates the destination.

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/honcho-setup.test.js
     ```

  **Expected failure:** an unconfirmed sensitive write succeeds or creates
  config, and a mode assertion observes the process-default permission.

- [ ] **5. Add the standard-library safe writer and route the runtime through it.**

  **Files:**
  - Create: `src/config-file.ts`
  - Modify: `src/index.ts`

  1. Create `src/config-file.ts` with exactly one exported operation,
     `writeJsonFileAtomic(configPath, value)`. Use only Node standard library:
     `mkdir`, `writeFile`, `chmod`, `rename`, `rm`, `path`, and
     `randomUUID`. The temporary filename must be in `path.dirname(configPath)`;
     it may use `.${path.basename(configPath)}.${process.pid}.${randomUUID()}.tmp`.

     Its sequence is:

     ```ts
     await mkdir(directory, { recursive: true })
     await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 })
     await chmod(tempPath, 0o600)
     await rename(tempPath, configPath)
     ```

     In a `finally`, attempt `rm(tempPath, { force: true })` and ignore only
     that cleanup failure. Because the temporary file and destination share a
     directory, `rename` is the atomic replacement; an earlier failure leaves
     the old destination untouched. Do not add locks, backups, a package, or
     retry logic.

  2. In `src/index.ts`, replace direct `mkdir`/`writeFile` calls in both
     `writeSettings` and `writeSharedGlobalSettings` with this helper. Keep
     the latter's existing legacy-API-key normalization before its helper
     call. Remove now-unused filesystem imports.

  3. Tighten `readJsonFile` at the trust boundary: after `JSON.parse`, reject
     anything for which the existing `isRecord` predicate is false with an
     error that names `configPath` and says it must contain a JSON object at
     the top level. Preserve the `ENOENT -> null` behavior. This makes setup,
     `honcho_set_config`, and the bootstrap path fail before they can replace
     malformed or array config.

  4. Add a `SENSITIVE_SETTING_FIELDS` set next to the existing setting-field
     sets. Its canonical names are `apiKey`, `baseUrl`, `workspace`,
     `peerName`, `aiPeer`, `sessionStrategy`, `sessionNaming`,
     `sessionPeerPrefix`, and `userPeerPrefix`.

  5. Add `confirm: tool.schema.boolean().optional()` to `honcho_setup`. Its
     first statement in `execute` must return a structured `{ ok: false,
     error, message }` response when `args.confirm !== true`, before declaring
     `resolvedGlobalConfigPath`, deriving a runtime, reading config, logging,
     validation, or network access. State in the message that the caller must
     retry with `confirm=true`; this is intentionally required even when
     `persistGlobal` is false because derivation can write the bootstrap
     config.

  6. In `honcho_set_config`, parse the requested field first. Preserve the
     existing structured invalid-field result. Immediately after parsing and
     before `deriveRuntimeHandle`, return the same shape of confirmation error
     when the field is in `SENSITIVE_SETTING_FIELDS` and `confirm !== true`.
     Only then derive the runtime, parse the value, read config, safely write,
     and evict the cache. Do not change the behavior of non-sensitive fields.

  7. Build and rerun Task 4's focused tests until green:

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run check
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/honcho-setup.test.js
     ```

  **Expected:** runtime configuration only accepts JSON objects; every native
  write uses atomic `0600` output; unconfirmed sensitive operations are inert.

- [ ] **6. Cover and route both TUI writers through the same safe writer.**

  **Files:**
  - Modify: `src/tui.ts`
  - Modify: `tests/tui-behavior.test.js`

  1. In `tests/tui-behavior.test.js`, import `chmod` and `stat` and extend the
     existing `saveSettings` test: seed an unrelated top-level field, set the
     file mode to `0644`, assert the field remains after saving, and assert
     the resulting config has mode `0600`.

  2. Add a test for the direct config-editor writer by exposing
     `writeSharedConfig` through the existing `__testing` object (it is an
     existing test-only export pattern, not a production API). Seed a valid
     config, set its mode to `0644`, call the helper with the complete next
     object, then assert mode `0600` and preservation of the supplied
     unrelated fields.

  3. Add preservation coverage for the TUI path: seed a malformed document
     and then a top-level array; call `saveSettings` in each case and assert
     rejection plus byte-for-byte unchanged content. `saveSettings` already
     reaches `readSharedConfig`, whose object validation must remain the
     guard; do not normalize bad content into `{}`.

  4. Rebuild and run the TUI behavior test. It should fail because both
     `writeSharedConfig` and `writeGlobalSettings` still use direct writes.

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/tui-behavior.test.js
     ```

  5. In `src/tui.ts`, replace the duplicated `mkdir`/`writeFile` sequences in
     `writeSharedConfig` and `writeGlobalSettings` with imports and calls to
     `writeJsonFileAtomic`. Do not change their merge/normalization logic or
     TUI dialog flow: selecting a field/value or submitting its value prompt
     is the existing user-consent action, and this delivery adds no second
     confirmation dialog. Remove now-unused direct-write imports.

  6. Rebuild and rerun the focused TUI test:

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run check
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test tests/tui-behavior.test.js
     ```

  **Expected:** every code path that writes `~/.honcho/config.json` has
  same-directory atomic replacement and `0600` permissions.

- [ ] **7. Document native confirmation, complete verification, and commit Delivery 2.**

  **Files:**
  - Modify: `README.md`
  - Regenerate: affected `dist/` bundles and declarations locally (ignored,
    not committed)

  1. In the **Agent Tools** section of `README.md`, state that
     `honcho_setup` requires `confirm=true` before it can persist settings,
     and that `honcho_set_config` requires it for identity/credential fields
     (`apiKey`, endpoint, peers, workspace, and session naming/strategy/
     prefixes). State that recall and context-performance fields remain
     directly editable. Do not claim an additional TUI confirmation step.

  2. Run the complete gate, inspect the final diff, and use the existing
     ponytail review to ensure the helper remains the smallest shared
     solution. Treat any full-suite failure not present in Task 0 as a
     regression to investigate before committing.

     ```sh
     PATH="/home/rafa/.bun/bin:$PATH" bun run check
     PATH="/home/rafa/.bun/bin:$PATH" bun run build
     PATH="/home/rafa/.bun/bin:$PATH" bun test ./tests
     git diff --check
     git diff -- src/config-file.ts src/index.ts src/tui.ts README.md tests/honcho-setup.test.js tests/tui-behavior.test.js
     ```

  3. Run `ponytail-review` on the staged Delivery 2 diff. Accept only
     findings supported by the code and rerun the affected checks if a change
     follows.

  4. Confirm the previous kill-switch commit remains untouched, then commit
     only tracked stage-2 work. The rebuilt `dist/` remains locally available
     for OpenCode but is intentionally ignored by Git:

     ```sh
     git add README.md src/config-file.ts src/index.ts src/tui.ts tests/honcho-setup.test.js tests/tui-behavior.test.js
     git commit -m "feat: make Honcho config writes safe"
     ```

  **Expected:** the second standalone commit requires explicit native consent
  for sensitive changes and atomically writes private, complete JSON config
  through both runtime and TUI entry points.

## Final handoff checklist

- [ ] `git log --oneline -2` shows the two commits in the stated order.
- [ ] `git status --short --branch` shows no unintended changes.
- [ ] `bun run check`, `bun run build`, and `bun test ./tests` results are
      recorded, with no regression beyond the documented baseline if it still
      exists.
- [ ] Generated `dist/` contains both production changes that OpenCode loads.
- [ ] No code, documentation, or commit message attributes work to AI.
