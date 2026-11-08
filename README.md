# @sigrun/provider-typesafe

Sigrun extension package: [TypeSafe](https://typesafe.ai) (Jev) as a
**decision provider** — typed questions (`noul` / `choice` / `score`)
answered over a JSON state through the bounded
[`pi-typesafe`](https://www.npmjs.com/package/pi-typesafe) client.

This is not a chat provider. It contributes to sigrun's
`decisionProviders` surface: extensions (or the core
`decision.evaluate` tool) ask small structured judgments via
`typesafe/<model>`.

## Install

```json
{
	"packages": ["@sigrun/provider-typesafe@^0.1.0"],
	"extensions": ["@sigrun/provider-typesafe"]
}
```

(in `settings.json` in the sigrun config dir; a restart syncs and
loads it.)

## Credential

The provider resolves its key exactly like every sigrun provider:
`auth.json["typesafe"].apiKey` first, then the ambient
`TYPESAFE_API_KEY`. It never reads `~/.pi/agent` and never reads
`process.env` itself — the key arrives as `ctx.credential` on every
evaluate call and is passed to `createTypeSafe({ apiKey })` verbatim.
Without a credential, evaluate throws `not configured`.

## Models

Default model list: `[{ id: "jev-latest" }]` with the pi-typesafe
default backend's limits. Override in scoped settings
(`settings/provider-typesafe.json` in the plugin's config section):

```json
{
	"backend": "typesafe",
	"models": [{ "id": "jev-latest" }],
	"caps": { "requestsPerDay": 100, "inputTokensPerDay": 2000000, "usdPerDay": 5 }
}
```

`backend` is a pi-typesafe registry name. An unknown name warns at
boot (`provider-typesafe: unknown backend "<name>"; using the default`)
and the provider falls back to `typesafe` instead of failing at the
first evaluate.
`caps` map to the pi-typesafe day caps; a reached cap throws
`budget: …` from evaluate and the readiness tracker reports
`degraded` until a success.

**Every setting needs a restart to take effect.** The factory reads
`settings/provider-typesafe.json` once when the extension loads, and each key
is consumed from that snapshot:

- `backend` and `models` are baked into the decision-provider
  contribution at construction (the client passes the parsed backend
  to `createTypeSafe` verbatim);
- `caps` are read from the same snapshot when a client is built, and
  one client is cached per credential — a running client never sees
  new caps.

Edit the file and restart sigrun; there is no live reload.

## Readiness and health

The tracker is synchronous, plugin-owned state:

- starts `ready`;
- `degraded` after a 401, a `budget` error, or 3 consecutive failures;
- `ready` again after a success.

Core reports `not_configured` itself when no credential resolves.
`health()` is `degraded` exactly when the tracker is.

## `/typesafe status`

```
TypeSafe ready; today 12 requests, 504 input tokens, ~$0.000021
TypeSafe degraded; today 12 requests, 504 input tokens, ~$0.000021; blocked: usdPerDay
```

Before the first evaluate call: `no client yet`.

## Usage accounting

Every call is recorded in a pi-typesafe usage ledger at
`<plugin state dir>/usage.json` (cross-process, day-windowed). One
client is reused per credential and rebuilt when the credential
changes.

## Development

```sh
npm install
npm test          # manifest check + vitest
npm run typecheck
npm run build     # emits dist/ (committed)
```

Tests are hermetic: a fake `fetch` (the `@typesafe-ai/sdk` transport
shape) serves crafted `SystemOneResult` bodies, and the ledger lives
in a temp dir. No network, no real keys.
