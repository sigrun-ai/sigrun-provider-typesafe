/**
 * Contract tests for @sigrun/provider-typesafe's scoped settings parser
 * (warden Task 8): defaults, the one recognized shape, and one warning
 * per invalid key. Hermetic — pure data, no I/O.
 */

import {
	resolveBackend,
	TypeSafeIntegrationError,
} from "pi-typesafe";
import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_BACKEND,
	DEFAULT_MODEL_ID,
	parseSettings,
} from "../src/settings.js";

vi.mock("pi-typesafe", async (importOriginal) => {
	const actual = await importOriginal<typeof import("pi-typesafe")>();
	return { ...actual, resolveBackend: vi.fn(actual.resolveBackend) };
});

describe("parseSettings", () => {
	it("parseSettings defaults and warns per invalid key", () => {
		const warnings: string[] = [];
		const settings = parseSettings({}, (m) => warnings.push(m));
		expect(settings).toEqual({
			backend: DEFAULT_BACKEND,
			models: [{ id: DEFAULT_MODEL_ID }],
			caps: {},
		});
		expect(warnings).toEqual([]);

		const more: string[] = [];
		const parsed = parseSettings(
			{
				backend: 42,
				models: [{ id: "" }, { id: "jev-9.9" }],
				caps: { requestsPerDay: -1, inputTokensPerDay: "lots", usdPerDay: 2.5 },
			},
			(m) => more.push(m),
		);
		expect(parsed.backend).toBe(DEFAULT_BACKEND);
		expect(parsed.models).toEqual([{ id: "jev-9.9" }]);
		expect(parsed.caps).toEqual({ usdPerDay: 2.5 });
		expect(more.length).toBe(4);
	});

	it("an unknown backend warns at boot and falls back to the default", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{ backend: "acme-nope" },
			(m) => warnings.push(m),
		);
		expect(settings.backend).toBe(DEFAULT_BACKEND);
		expect(warnings).toEqual([
			'provider-typesafe: unknown backend "acme-nope"; using the default',
		]);
	});

	it("rethrows non-configuration backend resolution failures", () => {
		const failure = new TypeSafeIntegrationError(
			"response",
			"synthetic resolver failure",
		);
		vi.mocked(resolveBackend).mockImplementationOnce(() => {
			throw failure;
		});
		expect(() => parseSettings({ backend: "typesafe" }, () => {})).toThrow(
			failure,
		);
	});

	it("a known non-default backend is preserved without warnings", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{ backend: "openrouter" },
			(m) => warnings.push(m),
		);
		expect(settings.backend).toBe("openrouter");
		expect(warnings).toEqual([]);
	});
});
