# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-10

### Changed

- Declare the provider's settings as JSON Schema through
  `host.settings.declare`, so its settings page is a generated form (the
  `Backend` field, the `Models` entry list, and a `Daily caps` group)
  instead of a JSON box, and every save is checked against the schema. The
  hand-written `parseSettings` parser is gone: core applies the same
  defaults (`backend: "typesafe"`, `models: [{id: "jev-latest"}]`,
  `caps: {}`) and repairs a malformed stored value to its default — the old
  per-key fallback, now with a load-time warning and an admin notice
  instead of a silent `console.warn`. Requires sigrun 0.13.0 or newer.
- Every key is `restart` (`x-sigrun-apply`): the provider reads the surface
  once at load — `backend` and `models` are baked into the decision-provider
  contribution and the caps are captured when a client is built — so an
  edited value lands at the next boot, which the README already documents.
- The backend-NAME check (pi-typesafe's registry) stays: JSON Schema can
  check that `backend` is a non-empty string but not that pi-typesafe knows
  the name, so an unknown name still warns at boot and falls back to the
  default rather than failing lazily at the first evaluate.
- **Leniency, key by key:** a malformed cap is REMOVED rather than repaired to a
  number (an unset cap stays uncapped — a repair to `0` would block every
  call), a model entry is dropped only when its `id` is missing or blank (as
  the parser dropped it), and an emptied model list falls back to the
  default list through `minItems: 1`. Two small differences from the
  deleted parser: unknown keys inside a model entry survive the read (the
  parser rebuilt each entry from `id`/`limits` only), and a `limits` group
  that holds no limit is normalised to the backend's built-in caps at
  construction instead of being omitted from the read.
- `@sigrun/sigrun` is now a peer dependency (`>=0.13.0`, the release
  carrying `host.settings.declare`), and `typebox` — the schema builder the
  host links — is an exact peer/dev pin (1.3.27).

## [0.1.3] - 2026-11-08

- CI: test against the latest released core (core-ref: release). No code change.

## [0.1.1] - 2026-11-07

## [0.1.2] - 2026-11-08

### Fixed

- An unknown `settings.backend` name now warns at boot and falls back
  to the default backend, instead of failing lazily with a
  configuration error on the first evaluate.

### Changed

- peer pi-durable/pi-ai/chord ~1.5.0 (requires sigrun 0.11.0).

## [0.1.0] - 2026-11-05

### Added

- Initial release: TypeSafe (Jev) as a sigrun decision provider —
  one pi-typesafe client per credential, a scoped-settings surface
  (`settings/typesafe.json`), a synchronous readiness tracker, and a
  `typesafe status` command reporting today's spend.
