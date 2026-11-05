/**
 * Scoped settings for @sigrun/provider-typesafe (warden Task 8):
 * `settings/typesafe.json`, read through the plugin host's scoped
 * settings store. The shape:
 *
 * ```json
 * {
 *   "backend": "typesafe",                     // a pi-typesafe BackendSpec
 *   "models": [{ "id": "jev-latest" }],        // the published model list
 *   "caps": { "requestsPerDay": 100, "inputTokensPerDay": 100000, "usdPerDay": 5 }
 * }
 * ```
 *
 * Unknown/invalid keys warn and fall back to the default for that key;
 * the file never hard-fails a boot (a malformed provider settings file
 * must not quarantine the extension loudly at the parser level — the
 * contribution still stands with defaults).
 */
import type { DecisionModelInfo } from "@sigrun/sigrun/extension";
/** pi-typesafe's default judgment backend (registry name). */
export declare const DEFAULT_BACKEND = "typesafe";
/** pi-typesafe's default model id on the default backend. */
export declare const DEFAULT_MODEL_ID = "jev-latest";
export interface TypesafeProviderSettings {
    readonly backend: string;
    readonly models: readonly DecisionModelInfo[];
    readonly caps: {
        readonly requestsPerDay?: number;
        readonly inputTokensPerDay?: number;
        readonly usdPerDay?: number;
    };
}
/**
 * Parse the scoped settings document. `raw` is the parsed JSON object
 * (or `{}`); every invalid key produces exactly one warning.
 */
export declare function parseSettings(raw: Record<string, unknown>, warn: (m: string) => void): TypesafeProviderSettings;
