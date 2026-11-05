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
export declare function spendNotice(plugin: TypesafePlugin): string;
/**
 * Build the `/typesafe` command contribution bound to one plugin. Only
 * the `status` subcommand is defined; anything else says so in one line.
 */
export declare function createTypesafeCommand(plugin: TypesafePlugin): ExtensionCommandContribution;
