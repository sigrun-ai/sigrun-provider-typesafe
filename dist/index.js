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
import { parseSettings } from "./settings.js";
import { createTypesafePlugin, } from "./provider.js";
import { createTypesafeCommand } from "./command.js";
export { parseSettings, DEFAULT_BACKEND, DEFAULT_MODEL_ID } from "./settings.js";
export { createTypesafePlugin, DEGRADED_AFTER_FAILURES } from "./provider.js";
export { createTypesafeCommand, spendNotice } from "./command.js";
/**
 * The sigrun extension-package factory. Arity 1 declares the
 * host-taking signature — sigrun's loader passes the seam host only to
 * factories that declare one (`factory.length > 0`). The optional
 * `deps` inject fetch/clock for tests (default-destructured AFTER the
 * host param, so the arity gate still holds).
 */
export default async function createTypesafeProvider(host, deps = {}) {
    const settings = await host.stores.settings.get();
    const parsed = parseSettings(settings, (m) => console.warn(m));
    const plugin = createTypesafePlugin(host, parsed, deps);
    return {
        name: "@sigrun/provider-typesafe",
        decisionProviders: [plugin.contribution],
        commands: [createTypesafeCommand(plugin)],
        health: plugin.health,
        plugin,
    };
}
