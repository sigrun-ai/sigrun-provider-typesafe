/**
 * Scoped settings for @sigrun/provider-typesafe (warden Task 8):
 * `settings/provider-typesafe.json`, read through the plugin host's scoped
 * settings store. The shape:
 *
 * ```json
 * {
 *   "backend": "typesafe",                     // a pi-typesafe registry name
 *   "models": [{ "id": "jev-latest" }],        // the published model list
 *   "caps": { "requestsPerDay": 100, "inputTokensPerDay": 100000, "usdPerDay": 5 }
 * }
 * ```
 *
 * Unknown/invalid keys warn and fall back to the default for that key;
 * the file never hard-fails a boot (a malformed provider settings file
 * must not quarantine the extension loudly at the parser level — the
 * contribution still stands with defaults) — except an unexpected
 * resolver failure, which propagates so it is not mislabelled
 * `unknown backend`.
 */
import { resolveBackend, TypeSafeIntegrationError, } from "pi-typesafe";
/** pi-typesafe's default judgment backend (registry name). */
export const DEFAULT_BACKEND = "typesafe";
/** pi-typesafe's default model id on the default backend. */
export const DEFAULT_MODEL_ID = "jev-latest";
const CAP_KEYS = ["requestsPerDay", "inputTokensPerDay", "usdPerDay"];
/** Parse one caps entry: a non-negative finite number, else warn+skip. */
function parseCaps(raw, warn) {
    if (raw === undefined)
        return {};
    if (typeof raw !== "object" || raw === null) {
        warn(`provider-typesafe: settings.caps must be an object; ignoring`);
        return {};
    }
    const out = {};
    for (const key of CAP_KEYS) {
        const value = raw[key];
        if (value === undefined)
            continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            warn(`provider-typesafe: settings.caps.${key} must be a non-negative number; ignoring`);
            continue;
        }
        out[key] = value;
    }
    return out;
}
/** Parse one model entry: `{id, limits?}`; invalid entries warn+drop. */
function parseModel(raw, warn) {
    if (typeof raw !== "object" || raw === null)
        return undefined;
    const id = raw.id;
    if (typeof id !== "string" || id.trim().length === 0)
        return undefined;
    const limitsRaw = raw.limits;
    let limits;
    if (typeof limitsRaw === "object" && limitsRaw !== null) {
        const src = limitsRaw;
        const out = {};
        for (const key of [
            "maxQuestions",
            "maxInputBytes",
            "minChoiceOptions",
            "maxScoreLevels",
        ]) {
            const value = src[key];
            if (value === undefined)
                continue;
            if (typeof value === "number" && Number.isFinite(value) && value > 0) {
                out[key] = value;
            }
        }
        if (Object.keys(out).length > 0) {
            limits = out;
        }
    }
    return limits === undefined ? { id } : { id, limits };
}
/**
 * Parse the scoped settings document. `raw` is the parsed JSON object
 * (or `{}`); every invalid key produces exactly one warning.
 */
export function parseSettings(raw, warn) {
    let backend = DEFAULT_BACKEND;
    if ("backend" in raw) {
        if (typeof raw.backend === "string" &&
            raw.backend.trim().length > 0) {
            backend = raw.backend.trim();
            // CHECK only: warn at boot instead of failing lazily at the
            // first evaluate. The raw name still goes to createTypeSafe —
            // a ResolvedBackend cannot round-trip into it (its object
            // form refuses the default key env and it resolves eagerly).
            try {
                resolveBackend(backend);
            }
            catch (error) {
                if (!(error instanceof TypeSafeIntegrationError) ||
                    error.code !== "configuration") {
                    throw error;
                }
                warn(`provider-typesafe: unknown backend "${backend}"; using the default`);
                backend = DEFAULT_BACKEND;
            }
        }
        else {
            warn("provider-typesafe: settings.backend must be a non-empty string; using the default");
        }
    }
    let models = [{ id: DEFAULT_MODEL_ID }];
    if ("models" in raw) {
        if (!Array.isArray(raw.models)) {
            warn("provider-typesafe: settings.models must be an array; using the default");
        }
        else {
            const parsed = raw.models
                .map((m) => parseModel(m, warn))
                .filter((m) => m !== undefined);
            if (parsed.length !== raw.models.length) {
                warn("provider-typesafe: settings.models dropped entries that were not {id: <non-empty string>}");
            }
            if (parsed.length === 0) {
                warn("provider-typesafe: settings.models left no usable entry; using the default");
            }
            else {
                models = parsed;
            }
        }
    }
    const caps = parseCaps(raw.caps, warn);
    return { backend: backend, models, caps };
}
