# AGENTS.md — sigrun-provider-typesafe

Guidance for coding agents working in this repository.

## What this is

`@sigrun/provider-typesafe` — a sigrun extension package contributing
TypeSafe (Jev) as a **decision provider** (typed questions over a JSON
state via `pi-typesafe`), NOT a chat provider. The factory result is
contributor-only: `{ name, decisionProviders, commands, health }`,
plus one extra field:

- `plugin` — the built `TypesafePlugin` internals (readiness tracker,
  health probe, and the `client()` accessor for the lazily-created
  pi-typesafe client). The status command is bound to it, and tests
  use it to drive `evaluate` and observe the client after the first
  call (the client does not exist at construction). It is not part of
  sigrun's contribution contract; the loader ignores it.

## Layout

- `src/index.ts` — the factory (default export, arity 1, async: the
  scoped settings store is async-only).
- `src/settings.ts` — `parseSettings` for the scoped
  `settings/typesafe.json` (backend, models, caps; warn-per-invalid-key).
  An unknown backend name is CHECKED with pi-typesafe's
  `resolveBackend` at parse time (warn + fall back to the default),
  but the raw string still goes to `createTypeSafe` — a
  `ResolvedBackend` cannot round-trip into it, so do not "simplify"
  the parse into passing the resolved object.
- `src/provider.ts` — the contribution: readiness tracker (ready /
  degraded rules), the one-client-per-credential pi-typesafe cache, and
  `evaluate` (error mapping: `not configured` without a credential,
  `<errorCode>: <message>` from pi-typesafe's typed errors).
- `src/command.ts` — the `/typesafe status` command (spend notice from
  `getSpend()`; `no client yet` before the first call).
- `dist/` — committed build output (extension repos commit `dist/`).
- `test/` — vitest suites, hermetic (fake `fetch`, temp-dir ledger).

## Run and test

```sh
npm install
npm test          # node scripts/check-manifest.mjs + vitest run
npm run typecheck
npm run build
```

`dist/` is committed build output — `npm run build` before committing,
and `git status -- dist` must be clean after.

## Conventions

- **Runtime dependency:** `pi-typesafe` only. The `@earendil-works/*`
  packages are peers (the host ships them); `@sigrun/sigrun` is a
  devDependency used for type-only imports of the extension contract —
  never a peer, never a runtime import of core internals.
- **No ambient reads:** the provider never reads `process.env` or
  `~/.pi/agent`. The credential arrives via `ctx.credential`; every
  `createTypeSafe` input is explicit.
- **Factory does no I/O:** the pi-typesafe client is built lazily on
  the first evaluate; the factory only reads scoped settings (once —
  every settings change needs a restart).
- **Tests own their literals:** synthetic keys (`"test-key"`),
  synthetic model ids, no real hosts or tokens.
- **Release manifest hygiene** is enforced by
  `scripts/check-manifest.mjs` (part of `npm test`): peer/dev pin
  split, publish metadata, files whitelist. Check it before fighting
  it.
- Commits are signed; the manifest check + tests + typecheck + build
  are the done gate.
