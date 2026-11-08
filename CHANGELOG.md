# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
