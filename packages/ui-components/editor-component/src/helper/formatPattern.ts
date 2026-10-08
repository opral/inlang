import type {
	Declaration,
	Expression,
	FunctionReference,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { resolveAnnotation } from "./declarations.js";
import { resolveValue } from "./resolveValue.js";
import { selectVariant } from "./selectVariant.js";

export type FormattedPart =
	| { type: "text"; value: string }
	| {
			type: "markup-start" | "markup-end" | "markup-standalone";
			name: string;
	  };

export type FormatPatternArgs = {
	pattern: Pattern;
	declarations?: readonly Declaration[];
	/** Values of input variables, keyed by name. */
	values?: Record<string, unknown>;
	locale: string;
};

/**
 * Formats a pattern into parts: text (adjacent text is merged) and markup.
 *
 * Expressions resolve variable references to input values or local
 * variables. Annotations: `plural`/`number`/`integer` use `Intl.NumberFormat`
 * (options such as style, currency, minimumFractionDigits are passed through),
 * `datetime`/`date`/`time` use `Intl.DateTimeFormat` (dateStyle/timeStyle and
 * field options; values may be a Date, an ISO string or a timestamp). Without
 * an annotation numbers and dates are formatted with locale defaults.
 * A missing value renders as `{name}`.
 */
export function formatPattern(args: FormatPatternArgs): FormattedPart[] {
	const { pattern, declarations, values = {}, locale } = args;
	const parts: FormattedPart[] = [];
	const pushText = (value: string) => {
		if (!value) return;
		const last = parts[parts.length - 1];
		if (last?.type === "text") last.value += value;
		else parts.push({ type: "text", value });
	};
	for (const part of pattern ?? []) {
		if (part.type === "text") pushText(part.value);
		else if (part.type === "expression")
			pushText(formatExpression(part, declarations, values, locale));
		else parts.push({ type: part.type, name: part.name });
	}
	return parts;
}

export type FormatMessageArgs = {
	message: Pick<Message, "selectors">;
	variants: readonly Variant[];
	declarations?: readonly Declaration[];
	values?: Record<string, unknown>;
	locale: string;
};

/**
 * Selects the variant for the values (see `selectVariant`) and formats it to
 * a plain string. Markup is dropped. Returns "" when no variant applies.
 */
export function formatMessage(args: FormatMessageArgs): string {
	const variant = selectVariant(args);
	if (!variant) return "";
	return formatPatternToString({ ...args, pattern: variant.pattern });
}

/** Like `formatPattern`, but returns the text only (markup is dropped). */
export function formatPatternToString(args: FormatPatternArgs): string {
	return formatPattern(args)
		.map((part) => (part.type === "text" ? part.value : ""))
		.join("");
}

function formatExpression(
	expression: Expression,
	declarations: readonly Declaration[] | undefined,
	values: Record<string, unknown>,
	locale: string
): string {
	const arg = expression.arg;
	const value =
		arg.type === "literal"
			? arg.value
			: resolveValue(arg.name, declarations, values);
	if (value === undefined || value === null) {
		return arg.type === "literal" ? "" : `{${arg.name}}`;
	}
	const annotation =
		expression.annotation ??
		(arg.type === "variable-reference"
			? resolveAnnotation(arg.name, declarations)
			: undefined);
	return formatValue(value, annotation, declarations, values, locale);
}

const NUMBER_FUNCTIONS = ["plural", "number", "integer", "percent", "currency"];
const DATE_FUNCTIONS = ["datetime", "date", "time"];

const NUMBER_OPTIONS = new Set([
	"style",
	"currency",
	"currencyDisplay",
	"currencySign",
	"unit",
	"unitDisplay",
	"notation",
	"compactDisplay",
	"signDisplay",
	"useGrouping",
	"roundingMode",
	"roundingPriority",
	"trailingZeroDisplay",
	"numberingSystem",
	"minimumIntegerDigits",
	"minimumFractionDigits",
	"maximumFractionDigits",
	"minimumSignificantDigits",
	"maximumSignificantDigits",
	"roundingIncrement",
]);

const DATE_OPTIONS = new Set([
	"dateStyle",
	"timeStyle",
	"weekday",
	"era",
	"year",
	"month",
	"day",
	"dayPeriod",
	"hour",
	"minute",
	"second",
	"fractionalSecondDigits",
	"timeZoneName",
	"timeZone",
	"hour12",
	"hourCycle",
	"calendar",
	"numberingSystem",
]);

function optionValues(
	annotation: FunctionReference,
	declarations: readonly Declaration[] | undefined,
	values: Record<string, unknown>,
	allowed: Set<string>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const option of annotation.options ?? []) {
		if (!allowed.has(option.name)) continue;
		const raw =
			option.value.type === "literal"
				? option.value.value
				: resolveValue(option.value.name, declarations, values);
		if (raw === undefined || raw === null || raw === "") continue;
		if (raw === "true" || raw === "false") result[option.name] = raw === "true";
		else if (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw))
			result[option.name] = Number(raw);
		else result[option.name] = raw;
	}
	return result;
}

function formatValue(
	value: unknown,
	annotation: FunctionReference | undefined,
	declarations: readonly Declaration[] | undefined,
	values: Record<string, unknown>,
	locale: string
): string {
	const name = annotation?.name;
	if (name && NUMBER_FUNCTIONS.includes(name)) {
		const number = typeof value === "number" ? value : Number(value);
		if (
			(typeof value === "string" && value.trim() === "") ||
			!Number.isFinite(number)
		)
			return String(value);
		const options = optionValues(
			annotation!,
			declarations,
			values,
			NUMBER_OPTIONS
		);
		if (name === "integer") options.maximumFractionDigits = 0;
		if (name === "percent") options.style = "percent";
		if (name === "currency") options.style = "currency";
		return formatNumber(number, locale, options);
	}
	if (name && DATE_FUNCTIONS.includes(name)) {
		const date = toDate(value);
		if (!date) return String(value);
		const options = optionValues(
			annotation!,
			declarations,
			values,
			DATE_OPTIONS
		);
		const style = annotation!.options?.find((o) => o.name === "style");
		const styleValue =
			style?.value.type === "literal" ? style.value.value : undefined;
		if (name === "date" && !options.dateStyle)
			options.dateStyle = styleValue ?? "medium";
		if (name === "time" && !options.timeStyle)
			options.timeStyle = styleValue ?? "short";
		if (
			name === "datetime" &&
			Object.keys(options).every((key) => !isDateField(key))
		) {
			options.dateStyle = "medium";
		}
		return formatDate(date, locale, options);
	}
	if (typeof value === "number") return formatNumber(value, locale, {});
	if (typeof value === "bigint") return formatNumber(value, locale, {});
	if (value instanceof Date)
		return Number.isNaN(value.getTime())
			? String(value)
			: formatDate(value, locale, { dateStyle: "medium" });
	return String(value);
}

const isDateField = (key: string) =>
	key.endsWith("Style") ||
	[
		"weekday",
		"era",
		"year",
		"month",
		"day",
		"hour",
		"minute",
		"second",
		"dayPeriod",
		"fractionalSecondDigits",
	].includes(key);

function formatNumber(
	value: number | bigint,
	locale: string,
	options: Record<string, unknown>
): string {
	try {
		return new Intl.NumberFormat(
			locale,
			options as Intl.NumberFormatOptions
		).format(value);
	} catch {
		try {
			return new Intl.NumberFormat(locale).format(value);
		} catch {
			return String(value);
		}
	}
}

function formatDate(
	value: Date,
	locale: string,
	options: Record<string, unknown>
): string {
	try {
		return new Intl.DateTimeFormat(
			locale,
			options as Intl.DateTimeFormatOptions
		).format(value);
	} catch {
		try {
			return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
				value
			);
		} catch {
			return value.toISOString();
		}
	}
}

/**
 * Converts a Date, ISO string or timestamp into a Date. Date-only strings
 * ("2026-10-08") are read as local dates so they do not shift by a day.
 */
export function toDate(value: unknown): Date | undefined {
	let date: Date | undefined;
	if (value instanceof Date) date = value;
	else if (typeof value === "number") date = new Date(value);
	else if (typeof value === "string" && value.trim()) {
		const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
		date = dateOnly
			? new Date(
					Number(dateOnly[1]),
					Number(dateOnly[2]) - 1,
					Number(dateOnly[3])
				)
			: new Date(value);
	}
	return date && !Number.isNaN(date.getTime()) ? date : undefined;
}
