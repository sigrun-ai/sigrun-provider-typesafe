/**
 * Contract tests for @sigrun/provider-typesafe's decision-provider
 * contribution (warden Task 8), hermetic: transport is a FAKE fetch
 * (the `@typesafe-ai/sdk` Fetch shape — a crafted SystemOneResult JSON
 * body), the usage ledger lives under a temp `paths.state` dir, and the
 * host is a structural slice. No network, no `~/.pi`, no ambient env
 * reads — the apiKey reaches the wire only through `ctx.credential`.
 *
 * Model ids, keys, and URLs are synthetic (tests own their literals).
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createTypesafeProvider from "../src/index.js";
import type { TypesafePluginHost } from "../src/provider.js";
import type { TypesafeProviderResult } from "../src/index.js";

const SUCCESS_BODY = {
	model: "jev-latest",
	answers: {
		verdict: { type: "noul", noul: 0.87 },
	},
	usage: { input_tokens: 42, output_tokens: 3 },
};

interface RecordedCall {
	readonly url: string;
	readonly headers: Record<string, string>;
}

/** A fake transport answering with a fixed body/status; records calls. */
function fakeFetch(
	body: unknown = SUCCESS_BODY,
	status = 200,
): { fetch: (input: string, init?: RequestInit) => Promise<Response>; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	return {
		calls,
		fetch: async (input: string, init?: RequestInit) => {
			calls.push({
				url: input,
				headers: (init?.headers ?? {}) as Record<string, string>,
			});
			return new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			});
		},
	};
}

function fakeHost(stateDir: string): TypesafePluginHost {
	return {
		stores: {
			settings: {
				get: async () => ({}),
				set: async () => {},
			},
			paths: { state: stateDir },
		},
	};
}

const REQUEST = {
	state: "a synthetic state",
	questions: { verdict: { type: "noul" as const, instructions: "holds?" } },
};

const CTX = { model: "jev-latest", caller: "test" };

describe("provider-typesafe", () => {
	let stateDir: string;
	let result: TypesafeProviderResult;

	beforeEach(async () => {
		stateDir = await mkdtemp(join(tmpdir(), "provider-typesafe-test-"));
	});

	afterEach(async () => {
		await rm(stateDir, { recursive: true, force: true });
	});

	it("createTypeSafe always receives apiKey from ctx.credential and a ledger under paths.state", async () => {
		// A leaked ambient key must NOT be read: the evaluate call is
		// given an explicit credential, and the wire must see THAT one.
		process.env.TYPESAFE_API_KEY = "ambient-must-not-be-used";
		try {
		const { fetch, calls } = fakeFetch();
		result = await createTypesafeProvider(fakeHost(stateDir), { fetch });
		const out = await result.plugin.contribution.evaluate(REQUEST, {
			...CTX,
			credential: "test-key",
			signal: AbortSignal.timeout(5_000),
		});
		expect(out.answers.verdict).toEqual({ type: "noul", noul: 0.87 });
		// The credential reached the wire — and ONLY because the factory
		// passed it to createTypeSafe as `apiKey`; nothing was read from
		// the ambient environment or ~/.pi.
		expect(calls.length).toBe(1);
		expect(calls[0]!.headers.Authorization).toBe("Bearer test-key");
		// The usage ledger lives under the plugin's state dir.
		expect(existsSync(join(stateDir, "usage.json"))).toBe(true);
		const ledger = JSON.parse(
			await readFile(join(stateDir, "usage.json"), "utf8"),
		);
		expect(JSON.stringify(ledger)).toContain("requestsSucceeded");
		} finally {
			delete process.env.TYPESAFE_API_KEY;
		}
	});

	it("an unknown backend in settings warns at boot and one evaluate uses the default backend", async () => {
		const { fetch, calls } = fakeFetch();
		const warnings: string[] = [];
		const warn = console.warn;
		console.warn = (m?: unknown) => warnings.push(String(m));
		try {
			result = await createTypesafeProvider(
				{
					stores: {
						settings: {
							get: async () => ({ backend: "acme-nope" }),
							set: async () => {},
						},
						paths: { state: stateDir },
					},
				},
				{ fetch },
			);
		} finally {
			console.warn = warn;
		}
		expect(warnings).toEqual([
			'provider-typesafe: unknown backend "acme-nope"; using the default',
		]);
		// The client is lazy: "created with the default" is only
		// observable on the wire after one evaluate with a credential.
		await result.plugin.contribution.evaluate(REQUEST, {
			...CTX,
			credential: "test-key",
			signal: AbortSignal.timeout(5_000),
		});
		expect(calls.length).toBe(1);
		expect(new URL(calls[0]!.url).origin).toBe("https://api.typesafe.ai");
	});

	it("evaluate returns answers, usage and model from a fake fetch", async () => {
		const { fetch } = fakeFetch();
		result = await createTypesafeProvider(fakeHost(stateDir), { fetch });
		const out = await result.plugin.contribution.evaluate(REQUEST, {
			...CTX,
			credential: "test-key",
			signal: AbortSignal.timeout(5_000),
		});
		expect(out.model).toBe("jev-latest");
		expect(out.usage).toEqual({ input_tokens: 42, output_tokens: 3 });
		expect(out.answers).toEqual(SUCCESS_BODY.answers);
	});

	it("no credential throws not configured", async () => {
		result = await createTypesafeProvider(fakeHost(stateDir), {
			fetch: fakeFetch().fetch,
		});
		await expect(
			result.plugin.contribution.evaluate(REQUEST, {
				...CTX,
				credential: undefined,
				signal: AbortSignal.timeout(5_000),
			}),
		).rejects.toThrow("not configured");
	});

	it("usdPerDay reached throws \"budget: …\" and readiness turns degraded", async () => {
		const { fetch } = fakeFetch();
		result = await createTypesafeProvider(fakeHost(stateDir), { fetch });
		// One success at 42 input tokens ($0.042/Mtok default would be
		// nothing; the plugin prices synthetic traffic at the settings'
		// default rate — set the cap below any real call).
		result = await createTypesafeProvider(
			{
				stores: {
					settings: {
						get: async () => ({ caps: { usdPerDay: 0.000001 } }),
						set: async () => {},
					},
					paths: { state: stateDir },
				},
			},
			{ fetch },
		);
		expect(result.plugin.readiness().status).toBe("ready");
		// The first call succeeds and records 42 input tokens in the
		// ledger; the SECOND call trips the usdPerDay cap (42 tokens at
		// the default $0.042/Mtok ≈ $0.0000018 > $0.000001) BEFORE any
		// fetch leaves the process.
		await result.plugin.contribution.evaluate(REQUEST, {
			...CTX,
			credential: "test-key",
			signal: AbortSignal.timeout(5_000),
		});
		await expect(
			result.plugin.contribution.evaluate(REQUEST, {
				...CTX,
				credential: "test-key",
				signal: AbortSignal.timeout(5_000),
			}),
		).rejects.toThrow(/^budget: /);
		expect(result.plugin.readiness().status).toBe("degraded");
	});

	it("the tracker starts ready and a 401 turns it degraded; a later success restores ready", async () => {
		// First answer 401, then succeed.
		let status = 401;
		const calls: RecordedCall[] = [];
		const fetch = async (input: string, init?: RequestInit) => {
			calls.push({
				url: input,
				headers: (init?.headers ?? {}) as Record<string, string>,
			});
			return new Response(
				JSON.stringify(
					status === 200 ? SUCCESS_BODY : { error: "unauthorized" },
				),
				{ status, headers: { "content-type": "application/json" } },
			);
		};
		result = await createTypesafeProvider(fakeHost(stateDir), { fetch });
		expect(result.plugin.readiness().status).toBe("ready");
		await expect(
			result.plugin.contribution.evaluate(REQUEST, {
				...CTX,
				credential: "test-key",
				signal: AbortSignal.timeout(5_000),
			}),
		).rejects.toThrow(/^http: /);
		expect(result.plugin.readiness().status).toBe("degraded");
		status = 200;
		const ok = await result.plugin.contribution.evaluate(REQUEST, {
			...CTX,
			credential: "test-key",
			signal: AbortSignal.timeout(5_000),
		});
		expect(ok.answers.verdict).toEqual({ type: "noul", noul: 0.87 });
		expect(result.plugin.readiness().status).toBe("ready");
	});
});
