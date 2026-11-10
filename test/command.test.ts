/**
 * Contract tests for @sigrun/provider-typesafe's `typesafe` status
 * command (warden Task 8): the notice is built from getSpend() —
 * `TypeSafe <status>; today <requests> requests, <inputTokens> input
 * tokens, ~$<usd>[; blocked: <cap>]` — and reads `no client yet` before
 * the first call. Hermetic: fake fetch + temp state dir, same slices as
 * provider.test.ts.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createTypesafeProvider from "../src/index.js";
import type { TypesafeProviderResult } from "../src/index.js";
import { declaredHost } from "./fake-host.js";

const SUCCESS_BODY = {
	model: "jev-latest",
	answers: { verdict: { type: "noul", noul: 0.87 } },
	usage: { input_tokens: 42, output_tokens: 3 },
};

const CTX = { model: "jev-latest", caller: "test" };

/** Run the command's `run` with a minimal structural context. */
async function runStatus(
	result: TypesafeProviderResult,
): Promise<string | undefined> {
	const ran = await result.commands[0]!.run({
		conversationId: "test" as never,
		args: "status",
		principal: { user: "tester", admin: false, service: false, method: "host" as const },
		host: undefined as never,
	});
	return ran === undefined ? undefined : ran.notice;
}

describe("typesafe command", () => {
	let stateDir: string;

	beforeEach(async () => {
		stateDir = await mkdtemp(join(tmpdir(), "provider-typesafe-test-"));
	});

	afterEach(async () => {
		await rm(stateDir, { recursive: true, force: true });
	});

	it("status prints spend and a reached cap", async () => {
		const fetch = async () =>
			new Response(JSON.stringify(SUCCESS_BODY), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		const result = await createTypesafeProvider(declaredHost(stateDir).host, {
			fetch,
		});

		// Before the first call there is no client at all.
		expect(await runStatus(result)).toBe("no client yet");

		await result.plugin.contribution.evaluate(
			{
				state: "a synthetic state",
				questions: {
					verdict: { type: "noul", instructions: "holds?" },
				},
			},
			{
				...CTX,
				credential: "test-key",
				signal: AbortSignal.timeout(5_000),
			},
		);
		const notice = await runStatus(result);
		expect(notice).toMatch(
			/^TypeSafe ready; today 1 requests, 42 input tokens, ~\$0\.000002$/,
		);
	});

	it("status names the blocked cap once a day cap is reached", async () => {
		const fetch = async () =>
			new Response(JSON.stringify(SUCCESS_BODY), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		const result = await createTypesafeProvider(
			declaredHost(stateDir, { caps: { requestsPerDay: 1 } }).host,
			{ fetch },
		);
		await result.plugin.contribution.evaluate(
			{
				state: "a synthetic state",
				questions: {
					verdict: { type: "noul", instructions: "holds?" },
				},
			},
			{
				...CTX,
				credential: "test-key",
				signal: AbortSignal.timeout(5_000),
			},
		);
		const notice = await runStatus(result);
		expect(notice).toMatch(
			/^TypeSafe ready; today 1 requests, 42 input tokens, ~\$0\.000002; blocked: requestsPerDay$/,
		);
	});
});
