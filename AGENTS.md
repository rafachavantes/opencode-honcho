# AGENTS.md

Honcho memory for **OpenCode**. TypeScript on `@opencode-ai/plugin` + a vendored `@honcho-ai/sdk`.
Sibling of `rafachavantes/claude-honcho` (Claude Code) and `rafachavantes/honcho-codex` (Codex CLI);
all three share one Honcho workspace and one user peer.

## Commands

```bash
bun run check          # tsc --noEmit
bun run build          # bundles src/ -> dist/ (also runs on `prepare`)
bun test ./tests       # note: the `test` script runs build first
```

**Exit gate (keep green):** `check` · `build` · `test`. There is no CI — these are the only gate.

**Known red:** `tests/honcho-setup.test.js` fails today (95 pass / 1 fail). It expects
`custom-peer` and gets `rafa` because it reads the **real** `~/.honcho/config.json` instead of an
isolated `HOME`. It only reads — the user's config is not overwritten — but the test is
environment-dependent and will behave differently on another machine. Same class of bug that
`claude-honcho` hit: fix it by pointing `HOME` at a temp dir in a subprocess, not by adjusting
the expectation.

## Gotchas

- **OpenCode loads this repo directly** — `~/.config/opencode/opencode.json` lists
  `/home/rafa/repos/opencode-honcho` as a plugin. But `package.json` has `main: ./dist/index.js`,
  and **`dist/` is gitignored and built**, so editing `src/` changes nothing until `bun run build`.
  This is the opposite of `honcho-codex`, where Codex executes the `.py` sources directly and an
  edit is live on the next turn. Forgetting the build here looks exactly like "my change had no effect".
- **The SDK is vendored** under `vendor/honcho-sdk/` and committed. Upgrading Honcho SDK behavior
  means touching that tree, not a `bun add`.
- **The user's config already overrides the expensive defaults.** In code, `contextScope` defaults
  to `"global"` and `sessionStartDialectic` to `true` (`src/index.ts:118-119`) — but Rafa's
  `~/.honcho/config.json` sets `hosts.opencode` to `contextScope: "session"` and
  `sessionStartDialectic: false`. Measure behavior against a config, never against the defaults in
  source, or you'll chase a cost that isn't being paid here.
- **Subdirectories become distinct sessions, deliberately** (`src/index.ts:669-672`): session
  identity resolves from `pluginInput.directory` / `pluginInput.worktree`, never from the git repo
  root. This makes it the only one of the three plugins that still splits one project's memory
  across sessions — `claude-honcho` (`sessionRootFor`) and `honcho-codex` (`_git_repo_root`) both
  resolve to the repo. Treat it as an open design question, not a bug to silently "fix": see the spec.
- **`session.compacted` is observed and only logged** (`src/index.ts:1480`). No post-compaction
  injection policy exists here, unlike the other two plugins. Measure before porting one.
- **This plugin already exposes tools to the model** (`src/index.ts:1596+`): settings, `status`,
  `set_config`, `search`, `chat`, `create_conclusion`. That puts it ahead of `honcho-codex`, which
  has no on-demand recall at all — worth reading as the reference when that gap gets closed there.

## Workflow (o jeito do Rafa)

Every phase: brainstorm (`superpowers:brainstorming`) → spec → **cold review** → apply findings →
plan (`superpowers:writing-plans`) → cold review → subagent-driven execution → merge.

**Cold review runs on Codex** — a different model, so it doesn't inherit this session's
assumptions, and it runs commands against the real repo.

- **Spec and plan gates → `/codex:rescue`.** `/codex:review` and `/codex:adversarial-review` build
  their target from `git diff` / `git status`, so they can't see files that aren't in the diff.
  Only `rescue` reads the filesystem directly.
- **Code gate → `/codex:adversarial-review`** over the branch diff — it challenges the approach,
  not just defects.
- **Write the prompt to demand verification, not opinion:** list the spec's factual claims and tell
  it to check each against the repo, reporting `file:line`. That is what catches confident,
  unverified claims.
- **State read-only** in the rescue prompt; `--background` for anything beyond a couple of files,
  `/codex:status` to follow. Model/effort default from `~/.codex/config.toml`, not the plugin.
- **Rafa gates:** spec approval is his. Don't self-approve and move on.
- **Code methodology: ponytail** — does it need to exist? does the codebase already have it?
  stdlib? platform? existing dep? one line? only then write code. After implementing, run
  `ponytail-review` to hunt over-engineering.

## Publishing

Never put AI attribution in anything published — no `Co-Authored-By` trailers, no "Generated with
Claude Code" footers, no `claude.ai/code/session_...` links, in commits, tags, PR or issue bodies,
or release notes. The author is Rafa. Strip whatever a tool template suggests appending; if one
slips through, amend the commit or `gh api -X PATCH` the body, then verify (`gh pr edit` can abort
on unrelated GraphQL errors and silently leave the body unchanged).

Don't open PRs or issues against third-party repositories without asking Rafa first.

## Documentation language

All documentation and code comments are written in **English**. Conversation with the maintainer
may be in Portuguese.

## Where things live

- Plugin entry, hooks, tools, session naming → `src/index.ts`
- TUI → `src/tui.ts` · server entry → `src/server.ts` · capabilities → `src/capabilities.ts`
- Vendored SDK → `vendor/honcho-sdk/`
- Specs → `docs/specs/`. Start with `2026-08-05-o-que-levar-do-claude-e-melhorias.md`: what the
  Claude plugin does today that's worth having here, the three findings above with file:line, and
  the open investigation gates.
