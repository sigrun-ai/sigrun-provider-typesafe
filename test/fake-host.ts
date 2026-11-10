/**
 * Settings fakes for the declared-settings suite (settings rework, Task 7).
 *
 * The host slice the factory takes is built here: the scoped state path (the
 * usage ledger's home) plus a `settings.declare` implemented with core's REAL
 * `checkStoredSettings` — so "the defaults", "a malformed value falls back"
 * and "an old file still loads" are facts about the same code core runs, not
 * a hand-written stand-in. The fake records the declaration and counts the
 * reads made through the handle, so a test pins both what was declared and
 * that nothing else read settings.
 *
 * `declare` is SINGLE-SHOT, like core's: a second declaration on one host
 * throws, so a test that accidentally runs the factory twice over one fake
 * fails here instead of passing on behaviour real core rejects.
 *
 * Two shapes: `declaredHost` lends a declaring host over a state dir a test
 * already owns (the command suite's temp dir); `createFakeHost` owns one.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
	DeclaredSettings,
	SettingsDeclaration,
} from "@sigrun/sigrun/extension";
import { checkStoredSettings } from "@sigrun/sigrun/settings-schema";

import type { TypesafePluginHost } from "../src/provider.js";

export interface DeclaredHost {
	/** The host slice the factory takes. */
	readonly host: TypesafePluginHost;
	/** The declaration the factory passed to `settings.declare`. */
	readonly declaration: SettingsDeclaration | undefined;
	/** Checked reads the factory performed through the declared handle. */
	readonly reads: number;
	/** The stored document as the declared schema checks it. */
	read(): Promise<Record<string, unknown>>;
}

/** A declaring host over `stateDir`, reading `settings` as the stored file. */
export function declaredHost(
	stateDir: string,
	settings: Record<string, unknown> = {},
): DeclaredHost {
	const state: { declaration: SettingsDeclaration | undefined; reads: number } = {
		declaration: undefined,
		reads: 0,
	};
	const declared = (): SettingsDeclaration => {
		if (state.declaration === undefined) throw new Error("the factory declared no settings");
		return state.declaration;
	};
	return {
		get declaration() {
			return state.declaration;
		},
		get reads() {
			return state.reads;
		},
		host: {
			settings: {
				declare<S, U = Record<string, never>>(
					declaration: SettingsDeclaration,
				): DeclaredSettings<S, U> {
					if (state.declaration !== undefined) {
						throw new Error("settings.declare may only be called once per extension");
					}
					state.declaration = declaration;
					return {
						get: async () => {
							state.reads += 1;
							return checkStoredSettings(declaration.schema, settings).value as S;
						},
						user: () => {
							throw new Error("provider-typesafe declares no user schema");
						},
					};
				},
			},
			stores: {
				paths: { state: stateDir },
			},
		},
		read: async () => checkStoredSettings(declared().schema, settings).value,
	};
}

export interface FakeHost extends DeclaredHost {
	/** The temp state dir the ledger lives under. */
	readonly stateDir: string;
	/** Remove the temp state dir. */
	cleanup(): Promise<void>;
}

/** A declaring host over its own fresh temp state dir. */
export async function createFakeHost(
	settings: Record<string, unknown> = {},
): Promise<FakeHost> {
	const stateDir = await mkdtemp(join(tmpdir(), "provider-typesafe-"));
	const base = declaredHost(stateDir, settings);
	// Getters are forwarded, not spread: a spread would snapshot `declaration`
	// (undefined) and `reads` (0) at construction, hiding the factory's own
	// declare and read from the test.
	return {
		host: base.host,
		get declaration() {
			return base.declaration;
		},
		get reads() {
			return base.reads;
		},
		read: base.read,
		stateDir,
		cleanup: async () => {
			await rm(stateDir, { recursive: true, force: true });
		},
	};
}
