/**
 * @sigrun/provider-typesafe — the TypeSafe (Jev) decision provider
 * (warden Task 8). This module owns:
 *
 * - the plugin host's structural slice (the scoped state path — declared
 *   here, like sigrun's other provider plugins, because the plugin cannot
 *   import sigrun core at runtime);
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

import { join } from "node:path";
import {
	createTypeSafe,
	openUsageLedger,
	resolveBackend,
	TypeSafeIntegrationError,
	DEFAULT_BACKEND_LIMITS,
	type BackendSpec,
	type TypeSafe,
} from "pi-typesafe";
import type {
	DecisionContext,
	DecisionModelInfo,
	DecisionProviderContribution,
	DeclaredSettings,
	ProviderReadiness,
	SettingsDeclaration,
} from "@sigrun/sigrun/extension";
import type { SystemOneRequest } from "pi-typesafe";
import { DEFAULT_BACKEND } from "./settings-schema.js";
/**
 * The `@typesafe-ai/sdk` transport shape: `(input, init) => Response`.
 * pi-typesafe 0.14.0 does NOT re-export this type (a verified gap —
 * the client option takes it, but the index only re-exports the SDK's
 * models/values), so it is declared here to the same signature.
 */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
import type { TypesafeProviderSettings } from "./settings-schema.js";

/**
 * Structural slice of sigrun's seam host (src/harness/seam-host.ts) a
 * decision-provider plugin consumes: the scoped state path the usage
 * ledger lives under, plus the declared-settings handle the factory reads
 * once through (`host.settings.declare`, the settings-rework contract).
 */
export interface TypesafePluginHost {
	readonly settings: {
		declare<S = Record<string, unknown>, U = Record<string, unknown>>(
			declaration: SettingsDeclaration,
		): DeclaredSettings<S, U>;
	};
	readonly stores: {
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
export const DEGRADED_AFTER_FAILURES = 3;

/**
 * The backend NAME the client can build. The schema checks the value's shape
 * (a non-empty string) and repairs a wrong type; membership in pi-typesafe's
 * registry is not expressible in JSON Schema, so the check the deleted
 * `parseSettings` parser performed stays — run once at construction (the
 * factory's call) so an unknown name warns at boot instead of failing lazily
 * with a configuration error at the first evaluate.
 *
 * A resolver failure that is not a `configuration` error propagates: that is
 * a registry fault, and calling it "unknown backend" would mislabel it.
 */
function usableBackend(backend: string, warn: (message: string) => void): string {
	// The deleted parser trimmed the resolved name; the schema can express
	// "not blank" but not a trim, so the trim stays here.
	const name = backend.trim();
	try {
		resolveBackend(name as BackendSpec);
		return name;
	} catch (error) {
		if (
			!(error instanceof TypeSafeIntegrationError) ||
			error.code !== "configuration"
		) {
			throw error;
		}
		warn(`provider-typesafe: unknown backend "${name}"; using the default`);
		return DEFAULT_BACKEND;
	}
}

/**
 * Build the TypeSafe decision-provider contribution over one settings
 * snapshot and one credential-keyed client cache.
 */
export function createTypesafePlugin(
	host: TypesafePluginHost,
	settings: TypesafeProviderSettings,
	deps: { fetch?: Fetch; now?: () => Date } = {},
): TypesafePlugin {
	const ledgerPath = join(host.stores.paths.state, "usage.json");
	const { fetch, now } = deps;
	// Resolved once here (construction time = the factory's boot) so an unknown
	// name warns loudly before any evaluate, exactly as the parser did.
	const backend = usableBackend(settings.backend, (m) => console.warn(m));

	// --- Readiness tracker (synchronous, plugin-owned). ---
	let degraded = false;
	let detail: string | undefined;
	let consecutiveFailures = 0;

	function status(): "ready" | "degraded" {
		return degraded ? "degraded" : "ready";
	}

	function noteSuccess(): void {
		consecutiveFailures = 0;
		degraded = false;
		detail = undefined;
	}

	function noteFailure(error: unknown): void {
		consecutiveFailures += 1;
		const typed =
			error instanceof TypeSafeIntegrationError ? error : undefined;
		if (
			typed !== undefined &&
			(typed.status === 401 || typed.code === "budget")
		) {
			degraded = true;
		} else if (consecutiveFailures >= DEGRADED_AFTER_FAILURES) {
			degraded = true;
		}
		if (degraded && error instanceof Error) {
			detail = error.message;
		}
	}

	// --- Client cache: ONE client per credential. ---
	let clientFor: { credential: string; client: TypeSafe } | undefined;

	function clientForCredential(credential: string): TypeSafe {
		if (clientFor !== undefined && clientFor.credential === credential) {
			return clientFor.client;
		}
		const caps = settings.caps;
		const client = createTypeSafe({
			apiKey: credential,
			backend: backend as never,
			maxRequests: Number.MAX_SAFE_INTEGER,
			...(caps.requestsPerDay !== undefined
				? { maxRequestsPerDay: caps.requestsPerDay }
				: {}),
			...(caps.inputTokensPerDay !== undefined
				? { maxInputTokensPerDay: caps.inputTokensPerDay }
				: {}),
			...(caps.usdPerDay !== undefined
				? { maxUsdPerDay: caps.usdPerDay }
				: {}),
			ledger: openUsageLedger({
				path: ledgerPath,
				...(now !== undefined ? { now } : {}),
			}),
			...(fetch !== undefined ? { fetch } : {}),
		});
		clientFor = { credential, client };
		return client;
	}

	const contribution: DecisionProviderContribution = {
		id: "typesafe",
		label: "TypeSafe (Jev)",
		credentialEnv: "TYPESAFE_API_KEY",
		// The backend's limits are known without a request; core applies
		// the built-in caps to entries without their own. An empty `limits`
		// object (every key invalid or cleared in the form) counts as no
		// limits, which is what the deleted parser produced.
		models: settings.models.map(
			(model): DecisionModelInfo =>
				model.limits !== undefined &&
				Object.keys(model.limits).length > 0
					? model
					: {
							...model,
							limits: {
								maxQuestions: DEFAULT_BACKEND_LIMITS.maxQuestions,
								minChoiceOptions:
									DEFAULT_BACKEND_LIMITS.minChoiceOptions,
								maxScoreLevels:
									DEFAULT_BACKEND_LIMITS.maxScoreLevels,
							},
						},
		),
		readiness: () => ({
			status: status(),
			...(detail !== undefined && status() === "degraded"
				? { detail }
				: {}),
		}),
		async evaluate(request, ctx) {
			if (ctx.credential === undefined || ctx.credential.trim() === "") {
				throw new Error(
					"typesafe is not configured (no credential resolved)",
				);
			}
			const client = clientForCredential(ctx.credential);
			try {
				const result = await client.evaluate(
					{ ...request, model: ctx.model } as SystemOneRequest,
					{ signal: ctx.signal },
				);
				noteSuccess();
				return {
					answers: result.answers as never,
					usage: result.usage,
					model: result.model,
				};
			} catch (error) {
				noteFailure(error);
				if (error instanceof TypeSafeIntegrationError) {
					throw new Error(`${error.code}: ${error.message}`);
				}
				throw error;
			}
		},
	};

	return {
		contribution,
		readiness: contribution.readiness!,
		health: () => (status() === "degraded" ? "degraded" : "ok"),
		client: () => clientFor?.client,
	};
}
