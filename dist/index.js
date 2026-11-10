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
 * Settings are declared as JSON Schema (`settings-schema.ts`) and read
 * through the declared handle, so core owns the form, the defaults and the
 * malformed-value repair. This extension's declared name and package name
 * are the same string, so the loader's provisional slug equals the final
 * slug (`provider-typesafe`) — a factory-time read through the handle
 * resolves the file the settings page writes. It reads once, because every
 * key is consumed at construction (`restart`).
 *
 * `pi-typesafe` is a real runtime dependency (the only one): the
 * provider calls it directly. The @earendil-works peers exist for the
 * host contract types only; `@sigrun/sigrun` is a peer (>=0.13.0 — the
 * release carrying `host.settings.declare`) with a `file:../sigrun` dev
 * link, used for type-only imports of the extension contract and, in the
 * test suite, the `@sigrun/sigrun/settings-schema` authoring surface.
 * `typebox` is an exact peer/dev pin (1.3.27), the schema builder the host
 * links.
 */
import { TYPESAFE_SETTINGS_SCHEMA, } from "./settings-schema.js";
import { createTypesafePlugin, } from "./provider.js";
import { createTypesafeCommand } from "./command.js";
export { TYPESAFE_SETTINGS_SCHEMA, DEFAULT_BACKEND, DEFAULT_MODEL_ID, } from "./settings-schema.js";
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
    const settings = host.settings.declare({
        schema: TYPESAFE_SETTINGS_SCHEMA,
    });
    // ONE read, at boot: every key lands in the plugin at construction, so an
    // edited value takes effect at the next restart (`x-sigrun-apply: restart`
    // on every property). The backend's registry check runs inside
    // `createTypesafePlugin` — the schema can only check the name's shape.
    const checked = await settings.get();
    const plugin = createTypesafePlugin(host, checked, deps);
    return {
        name: "@sigrun/provider-typesafe",
        decisionProviders: [plugin.contribution],
        commands: [createTypesafeCommand(plugin)],
        health: plugin.health,
        plugin,
    };
}
