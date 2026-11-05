/**
 * @sigrun/provider-typesafe — the TypeSafe (Jev) decision provider
 * (warden Task 8). This module owns:
 *
 * - the plugin host's structural slice (scoped settings + state paths —
 *   declared here, like sigrun's other provider plugins, because the
 *   plugin cannot import sigrun core);
 * - the readiness tracker (synchronous, plugin-owned state; starts
 *   `ready`, `degraded` after a 401, a `budget` error, or three
 *   consecutive failures, `ready` again after a success);
 * - the pi-typesafe client cache (ONE client per credential, rebuilt
 *   when `ctx.credential` changes; every constructor input is explicit —
 *   `apiKey`, the caps, `maxRequests: Number.MAX_SAFE_INTEGER`, a ledger
 *   under `host.stores.paths.state`, and the injected `fetch` — so
 *   `~/.pi/agent` and the ambient environment are never read);
 * - `evaluate(request, ctx)` itself: error mapping (`not configured`
 *   without a credential; `<errorCode>: <message>` from pi-typesafe's
 *   typed errors) and tracker updates around the call.
 *
 * At factory time the provider does NOTHING on the network: the client
 * is built lazily on the first evaluate (or the first `typesafe status`
 * call that follows one).
 */
import { type TypeSafe } from "pi-typesafe";
import type { DecisionProviderContribution, ProviderReadiness } from "@sigrun/sigrun/extension";
/**
 * The `@typesafe-ai/sdk` transport shape: `(input, init) => Response`.
 * pi-typesafe 0.14.0 does NOT re-export this type (a verified gap —
 * the client option takes it, but the index only re-exports the SDK's
 * models/values), so it is declared here to the same signature.
 */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
import type { TypesafeProviderSettings } from "./settings.js";
/**
 * Structural slice of sigrun's seam host (src/harness/seam-host.ts) a
 * decision-provider plugin consumes: the scoped settings store (async —
 * which is why the loader awaits factory results) plus the scoped state
 * path the usage ledger lives under.
 */
export interface TypesafePluginHost {
    readonly stores: {
        readonly settings: {
            get(): Promise<Record<string, unknown>>;
            set(value: Record<string, unknown>): Promise<void>;
        };
        readonly paths: {
            readonly state: string;
        };
    };
}
/** The read-only probe this plugin's `health` reports from. */
export type TypesafeHealthStatus = "ok" | "degraded";
/** One built plugin: the contribution's parts sharing tracker state. */
export interface TypesafePlugin {
    /** The decision-provider contribution (id, models, evaluate). */
    readonly contribution: DecisionProviderContribution;
    /** Synchronous read over plugin-owned state (never network/storage). */
    readonly readiness: () => ProviderReadiness;
    readonly health: () => TypesafeHealthStatus;
    /** The pi-typesafe client in use, when one has been built (undefined
     *  until the first evaluate). Exposed for the status command. */
    readonly client: () => TypeSafe | undefined;
}
/**
 * Consecutive generic failures that flip the tracker to `degraded`.
 * A 401 or a `budget` error flips it in one; transient failures need a
 * sustained pattern.
 */
export declare const DEGRADED_AFTER_FAILURES = 3;
/**
 * Build the TypeSafe decision-provider contribution over one settings
 * snapshot and one credential-keyed client cache.
 */
export declare function createTypesafePlugin(host: TypesafePluginHost, settings: TypesafeProviderSettings, deps?: {
    fetch?: Fetch;
    now?: () => Date;
}): TypesafePlugin;
