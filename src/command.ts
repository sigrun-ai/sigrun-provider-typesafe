/**
 * The `typesafe` status command (warden Task 8): `/typesafe status`
 * answers a notice built from the client's `getSpend()`:
 *
 *   TypeSafe <status>; today <requests> requests, <inputTokens> input
 *   tokens, ~$<usd>[; blocked: <cap>]
 *
 * Before the first evaluate call there is no client at all — the
 * notice is `no client yet` (never a network call from the command).
 */

import type { ExtensionCommandContribution } from "@sigrun/sigrun/extension";
import type { TypesafePlugin } from "./provider.js";

/** The spend notice's shape (pinned by the brief). */
export function spendNotice(
	plugin: TypesafePlugin,
): string {
	const client = plugin.client();
	if (client === undefined) return "no client yet";
	const spend = client.getSpend();
	const today = spend.today;
	const usd = today.estimatedUsd.toFixed(6);
	const base =
		`TypeSafe ${plugin.readiness().status}; today ` +
		`${today.requestsStarted} requests, ${today.inputTokens} input tokens, ` +
		`~$${usd}`;
	return spend.blocked === undefined
		? base
		: `${base}; blocked: ${spend.blocked.cap}`;
}

/**
 * Build the `/typesafe` command contribution bound to one plugin. Only
 * the `status` subcommand is defined; anything else says so in one line.
 */
export function createTypesafeCommand(
	plugin: TypesafePlugin,
): ExtensionCommandContribution {
	return {
		name: "typesafe",
		description: "TypeSafe (Jev) decision provider: status and spend",
		args: "[status]",
		run: async ({ args }) => {
			const sub = args.trim();
			if (sub === "" || sub === "status") {
				return { notice: spendNotice(plugin) };
			}
			return { notice: `typesafe: unknown subcommand "${sub}" (try "status")` };
		},
	};
}
