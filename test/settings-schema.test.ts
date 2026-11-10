/**
 * The provider's declared settings (settings rework, Task 7): one JSON Schema
 * through `host.settings.declare`, so core draws the settings page, applies
 * the defaults and repairs a malformed stored value — the per-key contract
 * the deleted `parseSettings` parser had. Every default asserted here is the
 * deleted parser's (`git show HEAD~1:src/settings.ts`), and the factory makes
 * exactly ONE checked read, at boot.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDrawable, checkStoredSettings } from "@sigrun/sigrun/settings-schema";

import { DEFAULT_BACKEND_LIMITS, TypeSafeIntegrationError } from "pi-typesafe";
import createTypesafeProvider, { type TypesafeProviderResult } from "../src/index.js";
import { TYPESAFE_SETTINGS_SCHEMA } from "../src/settings-schema.js";
import { createFakeHost, type FakeHost } from "./fake-host.js";

// The backend-NAME check calls pi-typesafe's registry resolver; spying on it
// drives the "a resolver fault is not mislabelled as an unknown backend" case
// (the deleted parser's suite mocked the same call).
vi.mock("pi-typesafe", async (importOriginal) => {
	const actual = await importOriginal<typeof import("pi-typesafe")>();
	return { ...actual, resolveBackend: vi.fn(actual.resolveBackend) };
});

/** The settings file README.md documents — a live install's shape. */
const OLD_FILE = {
	backend: "typesafe",
	models: [
		{ id: "jev-latest" },
		{ id: "jev-mini", limits: { maxQuestions: 8, maxInputBytes: 4_096 } },
	],
	caps: { requestsPerDay: 100, inputTokensPerDay: 2_000_000, usdPerDay: 5 },
};

/** The deleted parser's defaults, key for key. */
const OLD_DEFAULTS = {
	backend: "typesafe",
	models: [{ id: "jev-latest" }],
	caps: {},
};

describe("typesafe settings schema", () => {
	const fakes: FakeHost[] = [];
	afterEach(async () => {
		await Promise.all(fakes.splice(0).map((fake) => fake.cleanup()));
	});

	/** A fake host over `settings`, with ONE factory run (so it has declared). */
	async function declared(
		settings?: Record<string, unknown>,
	): Promise<{ fake: FakeHost; result: TypesafeProviderResult }> {
		const fake = await createFakeHost(settings);
		fakes.push(fake);
		return { fake, result: await createTypesafeProvider(fake.host) };
	}

	it("schema is drawable", () => {
		// No property may fall back to a JSON box: the page is a form, not an
		// editor, and `assertDrawable` also runs the load-time keyword checks.
		assertDrawable(TYPESAFE_SETTINGS_SCHEMA);
	});

	it("the factory declares the schema and reads it once", async () => {
		// The declared name and the package name are the same string, so the
		// loader's provisional slug equals the final slug (`provider-typesafe`)
		// and a factory-body read resolves the file the settings page writes —
		// no mismatch gate. Every key is consumed at construction, so one
		// boot-time read is the whole surface (`restart` on every property).
		const { fake } = await declared();
		expect(fake.declaration).toEqual({ schema: TYPESAFE_SETTINGS_SCHEMA });
		expect(fake.reads).toBe(1);
	});

	it("defaults match the old parser", async () => {
		expect(checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {}).value).toEqual(OLD_DEFAULTS);
		expect(await (await declared()).fake.read()).toEqual(OLD_DEFAULTS);
	});

	it("an old settings file still loads", async () => {
		// Nothing to repair: the documented shape is schema-valid as written, and
		// the model list (limits included) reaches the contribution unchanged.
		expect(checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, OLD_FILE).repairs).toEqual([]);
		const { fake, result } = await declared(OLD_FILE);
		expect(await fake.read()).toEqual(OLD_FILE);
		// The contribution fills a model that declares no limits with the three
		// built-ins the provider publishes (pre-existing behaviour, unchanged by
		// the settings rework); a model WITH limits arrives as written.
		expect(result.plugin.contribution.models).toEqual([
			{
				id: "jev-latest",
				limits: {
					maxQuestions: DEFAULT_BACKEND_LIMITS.maxQuestions,
					minChoiceOptions: DEFAULT_BACKEND_LIMITS.minChoiceOptions,
					maxScoreLevels: DEFAULT_BACKEND_LIMITS.maxScoreLevels,
				},
			},
			{ id: "jev-mini", limits: { maxQuestions: 8, maxInputBytes: 4_096 } },
		]);
	});

	it("caps stay optional", async () => {
		// No caps at all: the group is `{}` (uncapped), NOT a set of zero caps —
		// a cap repaired to a number would invent a budget the operator never
		// set, and 0 would block every call. `0` itself IS a real cap (the
		// deleted parser's bound was >= 0).
		expect(checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {}).value.caps).toEqual({});
		expect(checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, { caps: {} }).value.caps).toEqual({});
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, { caps: { usdPerDay: 5 } }).value.caps,
		).toEqual({ usdPerDay: 5 });
		const { fake } = await declared({ caps: { requestsPerDay: 0 } });
		expect(await fake.read()).toEqual({
			...OLD_DEFAULTS,
			caps: { requestsPerDay: 0 },
		});
	});

	it("a malformed cap is dropped, never repaired to a number", async () => {
		// The deleted parser skipped an invalid cap with a warning; the checked
		// read removes it, leaving the group uncapped — the same authority the
		// parser left in place.
		const checked = checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {
			caps: { requestsPerDay: -1, inputTokensPerDay: "lots", usdPerDay: 2.5 },
		});
		expect(checked.value.caps).toEqual({ usdPerDay: 2.5 });
		expect(checked.repairs.map((repair) => repair.path)).toEqual([
			"/caps/requestsPerDay",
			"/caps/inputTokensPerDay",
		]);
		// A caps value that is not an object falls back to the group default.
		expect(checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, { caps: 5 }).value.caps).toEqual({});
	});

	it("a malformed value falls back to its default", async () => {
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {
				backend: 42,
				models: "jev-latest",
			}).value,
		).toEqual(OLD_DEFAULTS);
		// A blank backend never reaches pi-typesafe: the parser trimmed and fell
		// back, and `pattern: "\\S"` reproduces that on a stored value.
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, { backend: "  " }).value.backend,
		).toBe("typesafe");
		// An entry that is not `{id: <non-empty string>}` is dropped, as the
		// parser dropped it; a list with nothing usable left is the default list
		// (`minItems: 1` + the default).
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {
				models: [{ id: "" }, { id: 42 }, { id: "jev-9.9" }],
			}).value.models,
		).toEqual([{ id: "jev-9.9" }]);
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, { models: [{ id: 42 }] }).value.models,
		).toEqual(OLD_DEFAULTS.models);
	});

	it("a limit the parser would have skipped is dropped, and an emptied group means none", async () => {
		// The parser kept a limit only when it was finite and above zero, and
		// left `limits` undefined when no key survived. A group the schema
		// accepted as `{}` is normalised to NO limits when the contribution is
		// built, so the backend's built-in caps are published for that model.
		expect(
			checkStoredSettings(TYPESAFE_SETTINGS_SCHEMA, {
				models: [{ id: "jev-mini", limits: { maxQuestions: 0, maxInputBytes: 4_096 } }],
			}).value.models,
		).toEqual([{ id: "jev-mini", limits: { maxInputBytes: 4_096 } }]);

		const { result } = await declared({
			models: [{ id: "jev-mini", limits: { maxScoreLevels: -1 } }],
		});
		expect(result.plugin.contribution.models[0]!.limits).toEqual({
			maxQuestions: DEFAULT_BACKEND_LIMITS.maxQuestions,
			minChoiceOptions: DEFAULT_BACKEND_LIMITS.minChoiceOptions,
			maxScoreLevels: DEFAULT_BACKEND_LIMITS.maxScoreLevels,
		});
	});

	it("an unknown backend warns at boot and falls back to the default", async () => {
		// JSON Schema checks the shape; pi-typesafe's registry decides
		// membership, so the boot-time check the deleted parser performed stays.
		const warnings: string[] = [];
		const warn = console.warn;
		console.warn = (message?: unknown) => warnings.push(String(message));
		try {
			await declared({ backend: "acme-nope" });
		} finally {
			console.warn = warn;
		}
		expect(warnings).toEqual([
			'provider-typesafe: unknown backend "acme-nope"; using the default',
		]);
	});

	it("a resolver fault that is not a configuration error is not mislabelled", async () => {
		// The parser rethrew a non-`configuration` resolver failure so a registry
		// fault could not be reported as an unknown backend; the check keeps that.
		const { resolveBackend } = await import("pi-typesafe");
		vi.mocked(resolveBackend).mockImplementationOnce(() => {
			throw new TypeSafeIntegrationError("response", "synthetic resolver failure");
		});
		await expect(declared({ backend: "acme-nope" })).rejects.toThrow(
			"synthetic resolver failure",
		);
	});
});
