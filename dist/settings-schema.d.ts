/**
 * @sigrun/provider-typesafe's declared settings (settings rework, Task 7):
 * the whole scoped surface — `backend`, `models`, `caps` — as one JSON
 * Schema, declared through `host.settings.declare`. Core generates the
 * settings page's form from it, applies the defaults and repairs a malformed
 * stored value back to its default: the per-key leniency the deleted
 * `parseSettings` parser had, now with a load-time warning and an admin
 * notice instead of a silent `console.warn`.
 *
 * Every key is `restart` (`x-sigrun-apply`): the provider reads this surface
 * ONCE when the extension loads — `backend` and `models` are baked into the
 * decision-provider contribution and the caps are captured when a client is
 * built — so an edited value lands at the next boot, the contract README
 * already documents.
 */
import { Type, type Static } from "typebox";
/** pi-typesafe's default judgment backend (registry name). */
export declare const DEFAULT_BACKEND = "typesafe";
/** pi-typesafe's default model id on the default backend. */
export declare const DEFAULT_MODEL_ID = "jev-latest";
export declare const TYPESAFE_SETTINGS_SCHEMA: Type.TObject<{
    backend: Type.TString;
    models: Type.TArray<Type.TObject<{
        id: Type.TString;
        limits: Type.TOptional<Type.TObject<{
            maxQuestions: Type.TOptional<Type.TNumber>;
            maxInputBytes: Type.TOptional<Type.TNumber>;
            minChoiceOptions: Type.TOptional<Type.TNumber>;
            maxScoreLevels: Type.TOptional<Type.TNumber>;
        }>>;
    }>>;
    caps: Type.TObject<{
        requestsPerDay: Type.TOptional<Type.TNumber>;
        inputTokensPerDay: Type.TOptional<Type.TNumber>;
        usdPerDay: Type.TOptional<Type.TNumber>;
    }>;
}> & Readonly<Record<string, unknown>>;
export type TypesafeProviderSettings = Static<typeof TYPESAFE_SETTINGS_SCHEMA>;
