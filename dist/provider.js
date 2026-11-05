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
import { join } from "node:path";
import { createTypeSafe, openUsageLedger, TypeSafeIntegrationError, DEFAULT_BACKEND_LIMITS, } from "pi-typesafe";
/**
 * Consecutive generic failures that flip the tracker to `degraded`.
 * A 401 or a `budget` error flips it in one; transient failures need a
 * sustained pattern.
 */
export const DEGRADED_AFTER_FAILURES = 3;
/**
 * Build the TypeSafe decision-provider contribution over one settings
 * snapshot and one credential-keyed client cache.
 */
export function createTypesafePlugin(host, settings, deps = {}) {
    const ledgerPath = join(host.stores.paths.state, "usage.json");
    const { fetch, now } = deps;
    // --- Readiness tracker (synchronous, plugin-owned). ---
    let degraded = false;
    let detail;
    let consecutiveFailures = 0;
    function status() {
        return degraded ? "degraded" : "ready";
    }
    function noteSuccess() {
        consecutiveFailures = 0;
        degraded = false;
        detail = undefined;
    }
    function noteFailure(error) {
        consecutiveFailures += 1;
        const typed = error instanceof TypeSafeIntegrationError ? error : undefined;
        if (typed !== undefined &&
            (typed.status === 401 || typed.code === "budget")) {
            degraded = true;
        }
        else if (consecutiveFailures >= DEGRADED_AFTER_FAILURES) {
            degraded = true;
        }
        if (degraded && error instanceof Error) {
            detail = error.message;
        }
    }
    // --- Client cache: ONE client per credential. ---
    let clientFor;
    function clientForCredential(credential) {
        if (clientFor !== undefined && clientFor.credential === credential) {
            return clientFor.client;
        }
        const caps = settings.caps;
        const client = createTypeSafe({
            apiKey: credential,
            backend: settings.backend,
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
    const contribution = {
        id: "typesafe",
        label: "TypeSafe (Jev)",
        credentialEnv: "TYPESAFE_API_KEY",
        // The backend's limits are known without a request; core applies
        // the built-in caps to entries without their own.
        models: settings.models.map((model) => model.limits !== undefined
            ? model
            : {
                ...model,
                limits: {
                    maxQuestions: DEFAULT_BACKEND_LIMITS.maxQuestions,
                    minChoiceOptions: DEFAULT_BACKEND_LIMITS.minChoiceOptions,
                    maxScoreLevels: DEFAULT_BACKEND_LIMITS.maxScoreLevels,
                },
            }),
        readiness: () => ({
            status: status(),
            ...(detail !== undefined && status() === "degraded"
                ? { detail }
                : {}),
        }),
        async evaluate(request, ctx) {
            if (ctx.credential === undefined || ctx.credential.trim() === "") {
                throw new Error("typesafe is not configured (no credential resolved)");
            }
            const client = clientForCredential(ctx.credential);
            try {
                const result = await client.evaluate({ ...request, model: ctx.model }, { signal: ctx.signal });
                noteSuccess();
                return {
                    answers: result.answers,
                    usage: result.usage,
                    model: result.model,
                };
            }
            catch (error) {
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
        readiness: contribution.readiness,
        health: () => (status() === "degraded" ? "degraded" : "ok"),
        client: () => clientFor?.client,
    };
}
