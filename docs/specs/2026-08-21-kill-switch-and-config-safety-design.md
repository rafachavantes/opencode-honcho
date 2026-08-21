# Design — one-shot kill switch and safe configuration writes

**Date:** 2026-08-21  
**Status:** Implemented and verified.

## Goal

Bring the OpenCode plugin in line with the applicable reliability behavior of
the sibling Honcho plugins, without adding MCP, queues, retries, or new
persistent settings.

The work has two independently shippable implementation stages:

1. A one-shot `HONCHO_ENABLED` kill switch.
2. Explicit confirmation and safe writes for the shared Honcho configuration.

Each stage is built, tested, and committed separately. The design and the
implementation plan cover both stages.

## Scope

### Stage 1 — one-shot kill switch

`HONCHO_ENABLED` controls a single OpenCode invocation:

```sh
HONCHO_ENABLED=false opencode run ...
opencode run ...
```

The falsy values are `0`, `false`, `no`, and `off`, case-insensitively. Any
other value, including an unset variable, means enabled.

When disabled:

- `createHonchoRuntimePlugin(...)` returns an empty hooks object as the first
  action of its async factory function.
- No session state or runtime cache is allocated.
- No config is read or created, no client is constructed, and no network or
  logging operation occurs.
- No runtime hooks, native Honcho tools, or command interception are
  registered.
- The separate TUI entry registers no `/honcho:*` commands.

The enabled path is unchanged. The environment is read directly from
`process.env`; OpenCode runs this plugin in-process, so no subprocess
propagation mechanism is needed.

### Stage 2 — safe configuration writes

The native `honcho_setup` and `honcho_set_config` tools must require
`confirm=true` before persisting a setting that can expose credentials or make
existing memory appear to disappear:

- `apiKey` and `baseUrl`;
- `workspace`;
- `peerName` and `aiPeer`;
- `sessionStrategy`, `sessionNaming`, `sessionPeerPrefix`, and
  `userPeerPrefix`.

`recallMode`, `contextScope`, and `sessionStartDialectic` remain directly
editable because they change behavior without changing the memory identity.

`honcho_setup` is a write path too. It must check confirmation before deriving
the runtime, because runtime derivation can bootstrap the shared config file.
This prevents an unconfirmed setup call from causing an implicit write.

All writers of `~/.honcho/config.json` use the same safe-write behavior:

- serialize the complete JSON object to a temporary file in the same
  directory;
- set the temporary file mode to `0600`;
- atomically rename it over the destination.

This applies to the runtime entry and the TUI entry. The runtime shared-config
reader must validate that parsed JSON is an object before setup or native
configuration writes use it. A malformed or non-object JSON config is rejected
and is never overwritten.

The TUI's explicit field-selection or value-prompt action is its consent
mechanism; this stage does not add a second UI confirmation screen.

## Design choices

### Kill-switch placement

The runtime check is a tiny local helper plus an early return in
`createHonchoRuntimePlugin`. The condition is the first statement of the
async factory so disabled executions cannot reach setup code indirectly.

`src/tui.ts` needs its own equally small environment check before command
registration. It is a separately loaded entry point, so an early return in
`src/index.ts` alone cannot guarantee that command-palette entries disappear.
Do not add a shared module solely for this tiny predicate.

### Configuration writer placement

The same shared config file is written through runtime and TUI entry points.
Use one small internal safe-write helper for that file rather than copying
temporary-file and permission logic across every writer. Do not change writes
to unrelated configuration files.

## Error handling

- A sensitive native-tool write without `confirm=true` returns a structured
  error before validation, network access, config creation, cache eviction, or
  file mutation.
- Failed safe writes retain the existing file; a failed temporary-file write
  must not leave a partially written destination.
- Existing setup validation failures continue to return the current
  structured error and do not persist invalid cloud credentials.
- Disabling Honcho is silent and inert. It does not write a marker, alter
  persisted settings, or affect a later execution without the environment
  variable.

## Testing and verification

Add focused coverage in the existing test files:

- Parameterized runtime coverage proves that `0`, `false`, `no`, `off`, and a
  mixed-case falsy value return no hooks or native tools. An unset or
  non-falsy value retains the enabled behavior.
- A disabled runtime is created with a log spy, mocked HTTP, and an invalid
  shared config path. It performs no log call, config read or creation, HTTP
  request, or state write.
- With the flag disabled, the TUI registers no Honcho commands.
- `honcho_setup` and `honcho_set_config` reject unconfirmed sensitive writes
  without touching the shared config; confirmed writes preserve existing
  behavior.
- Each path that writes `~/.honcho/config.json` produces mode `0600` and
  preserves valid existing JSON fields.
- Malformed and non-object shared configuration remain untouched for both
  native writer paths and the TUI writer.

The repository's normal gate is:

```sh
bun run check
bun run build
bun test ./tests
```

This checkout currently has no `node_modules`, so the implementation phase
must restore dependencies from the existing lockfile before those commands can
run. `dist/` must be rebuilt after each implementation stage because OpenCode
loads `dist/index.js`.

## Documentation

Stage 1 adds the environment variable and both usage examples to `README.md`.
Stage 2 documents the confirmation requirement where the native configuration
tools are described. Documentation about Codex MCP, its cache, or its remote
branch is explicitly out of scope.

## Exclusions

- MCP servers or tools;
- session-id mapping for another host;
- persistent kill-switch settings, CLI flags, or new dependencies;
- queueing, retries, or a 429 backoff mechanism;
- changing session-root semantics or post-compaction behavior;
- changing memory behavior when `HONCHO_ENABLED` is absent.
