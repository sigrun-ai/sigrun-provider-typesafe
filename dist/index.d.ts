/**
 * @sigrun/provider-typesafe — a sigrun extension package contributing
 * TypeSafe (Jev) as a DECISION provider (warden Task 8): typed questions
 * (noul / choice / score) answered over a JSON state through
 * pi-typesafe's bounded client.
 *
 * The default export is the factory: arity 1 (host-taking), async
 * because the scoped settings store is async-only (sigrun's loader
 * awaits factory results). The factory result is contributor-only —
 * `{ name, decisionProviders, commands, health }` with no `extension`
 * field. The provider does NOTHING on the network at factory time: the
 * pi-typesafe client is built lazily on the first `evaluate` call (one
 * client per credential, every constructor input explicit — `~/.pi/agent`
 * and the ambient environment are never read).
 *
 * `pi-typesafe` is a real runtime dependency (the only one): the
 * provider calls it directly. The @earendil-works peers exist for the
 * host contract types only; `@sigrun/sigrun` is a devDependency used
 * for type-only imports of the extension contract.
 */
import type { DecisionProviderContribution, ExtensionCommandContribution } from "@sigrun/sigrun/extension";
import type { Fetch } from "./provider.js";
import { type TypesafePlugin, type TypesafePluginHost } from "./provider.js";
export { parseSettings, DEFAULT_BACKEND, DEFAULT_MODEL_ID } from "./settings.js";
export type { TypesafeProviderSettings } from "./settings.js";
export { createTypesafePlugin, DEGRADED_AFTER_FAILURES } from "./provider.js";
export type { Fetch } from "./provider.js";
export type { TypesafePlugin, TypesafePluginHost, TypesafeHealthStatus, } from "./provider.js";
export { createTypesafeCommand, spendNotice } from "./command.js";
/**
 * The factory-result shape for a decision-provider contributor: the
 * contribution, the status command, and the plugin-level health probe.
 */
export interface TypesafeProviderResult {
    readonly name: "@sigrun/provider-typesafe";
    readonly decisionProviders: readonly DecisionProviderContribution[];
    readonly commands: readonly ExtensionCommandContribution[];
    readonly health: () => "ok" | "degraded";
    /** The built plugin internals (tests, the status command). */
    readonly plugin: TypesafePlugin;
}
/**
 * The sigrun extension-package factory. Arity 1 declares the
 * host-taking signature — sigrun's loader passes the seam host only to
 * factories that declare one (`factory.length > 0`). The optional
 * `deps` inject fetch/clock for tests (default-destructured AFTER the
 * host param, so the arity gate still holds).
 */
export default function createTypesafeProvider(host: TypesafePluginHost, deps?: {
    fetch?: Fetch;
    now?: () => Date;
}): Promise<TypesafeProviderResult>;
