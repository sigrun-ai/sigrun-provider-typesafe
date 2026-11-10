/**
 * @sigrun/provider-typesafe's declared settings (settings rework, Task 7):
 * the whole scoped surface — `backend`, `models`, `caps` — as one JSON
 * Schema, declared through `host.settings.declare`. Core generates the
 * settings page's form from it, applies the defaults and repairs a malformed
 * stored value back to its default: the per-key leniency the deleted
 * `parseSettings` parser had, now with a load-time warning and an admin
 * notice instead of a silent `console.warn`.
 *
 * Every key is `restart` (`x-sigrun-apply`): the provider reads this surface
 * ONCE when the extension loads — `backend` and `models` are baked into the
 * decision-provider contribution and the caps are captured when a client is
 * built — so an edited value lands at the next boot, the contract README
 * already documents.
 */

import { Type, type Static } from "typebox";

/**
 * Widen a TypeBox schema to the host's structural JSON-Schema contract
 * (`SettingsJsonSchema = Readonly<Record<string, unknown>>`): TypeBox's
 * TObject carries no string index signature, but every schema it builds
 * IS a plain JSON object. The `Static` type stays on the original.
 */
function asJsonSchema<T>(schema: T): T & Readonly<Record<string, unknown>> {
	return schema as T & Readonly<Record<string, unknown>>;
}

/** pi-typesafe's default judgment backend (registry name). */
export const DEFAULT_BACKEND = "typesafe";
/** pi-typesafe's default model id on the default backend. */
export const DEFAULT_MODEL_ID = "jev-latest";

/**
 * A model limit. The deleted parser kept a limit only when it was a finite
 * number ABOVE zero and dropped everything else, so `exclusiveMinimum: 0`
 * is the same bound — a dropped limit leaves the backend's built-in cap in
 * charge. Limits sit inside an array entry, so they have no default of their
 * own: an absent or malformed one is removed, never filled in.
 */
function limit(title: string, description: string) {
	return Type.Optional(
		Type.Number({
			title,
			description,
			exclusiveMinimum: 0,
			"x-sigrun-apply": "restart",
		}),
	);
}

/** `DecisionLimits`: each key narrows one of the backend's built-in caps. */
const LIMITS_SCHEMA = Type.Object(
	{
		maxQuestions: limit(
			"Max questions",
			"Questions per request, below the backend's cap.",
		),
		maxInputBytes: limit(
			"Max input bytes",
			"Serialized state size in bytes, below the backend's cap.",
		),
		minChoiceOptions: limit(
			"Min choice options",
			"Choice options a `choice` question must offer.",
		),
		maxScoreLevels: limit(
			"Max score levels",
			"Score levels a `score` question may use.",
		),
	},
	{
		title: "Limits",
		description:
			"Narrower than the backend's built-in caps. An absent key keeps the backend's value.",
		"x-sigrun-apply": "restart",
	},
);

/**
 * One published model (`DecisionModelInfo`): the bare id, plus limits. `id`
 * is the entry identity (`x-sigrun-key`) and the row summary — the type
 * carries no other display field.
 */
const MODEL_SCHEMA = Type.Object(
	{
		id: Type.String({
			title: "Model id",
			description: "The bare model id this provider publishes, e.g. `jev-latest`.",
			minLength: 1,
			// The deleted parser trimmed before its non-empty check; `\S` is that
			// same "not blank" test on a stored value (JSON Schema cannot trim).
			pattern: "\\S",
			"x-sigrun-apply": "restart",
		}),
		limits: Type.Optional(LIMITS_SCHEMA),
	},
	{
		title: "Model",
		description: "One model this provider publishes.",
		"x-sigrun-key": "id",
		"x-sigrun-summary": ["id"],
	},
);

/**
 * One pi-typesafe day cap: a non-negative number (the deleted parser's
 * bound), ABSENT when the operator does not cap it. A malformed value is
 * therefore removed rather than repaired to a number — a repair to `0`
 * would block every call.
 */
function cap(title: string, description: string) {
	return Type.Optional(
		Type.Number({
			title,
			description,
			minimum: 0,
			"x-sigrun-apply": "restart",
		}),
	);
}

export const TYPESAFE_SETTINGS_SCHEMA = asJsonSchema(
	Type.Object({
		backend: Type.String({
			title: "Backend",
			description:
				"A pi-typesafe backend registry name (its BackendSpec), e.g. `typesafe`. An unknown name warns at boot and falls back to the default.",
			minLength: 1,
			// `\S`: the deleted parser trimmed the name before resolving it, so a
			// blank value fell back to the default rather than reaching pi-typesafe.
			pattern: "\\S",
			default: DEFAULT_BACKEND,
			"x-sigrun-apply": "restart",
		}),
		models: Type.Array(MODEL_SCHEMA, {
			title: "Models",
			description:
				"The models this provider publishes. Each entry may narrow the backend's limits; the provider publishes none of its own beyond these.",
			minItems: 1,
			default: [{ id: DEFAULT_MODEL_ID }],
			"x-sigrun-apply": "restart",
		}),
		caps: Type.Object(
			{
				requestsPerDay: cap(
					"Requests per day",
					"Requests per day, counted in the usage ledger.",
				),
				inputTokensPerDay: cap(
					"Input tokens per day",
					"Input tokens per day, counted in the usage ledger.",
				),
				usdPerDay: cap(
					"USD per day",
					"Estimated spend per day, counted in the usage ledger.",
				),
			},
			{
				title: "Daily caps",
				description:
					"Enforced by pi-typesafe's usage ledger. A cap you leave empty is uncapped; a reached cap throws `budget: …` from evaluate until the next day.",
				default: {},
				"x-sigrun-apply": "restart",
			},
		),
	}),
);

export type TypesafeProviderSettings = Static<typeof TYPESAFE_SETTINGS_SCHEMA>;
