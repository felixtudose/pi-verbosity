/**
 * Tool renderers for the `minimal` and `verbose` levels.
 *
 * Tool components pick their renderers once, when the tool call is created, so a
 * level change re-renders the transcript through `/reload` rather than mutating
 * components in place.
 */
import type { Theme, ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { VerbosityLevel } from "./levels.ts";

const MAX_ARGUMENT_WIDTH = 200;

/** Renders nothing, so a collapsed row keeps only its call line. */
class EmptyComponent implements Component {
	render(): string[] {
		return [];
	}
	invalidate(): void {}
}

class LineComponent implements Component {
	private readonly line: string;

	constructor(line: string) {
		this.line = line;
	}

	render(width: number): string[] {
		return [truncateToWidth(this.line, Math.max(1, width), "…")];
	}

	invalidate(): void {}
}

function firstLine(text: string): string {
	const line = text.split("\n")[0] ?? "";
	return line.length > MAX_ARGUMENT_WIDTH ? `${line.slice(0, MAX_ARGUMENT_WIDTH)}…` : line;
}

/** Short human summary of a tool call: its command, path, or first scalar argument. */
export function summarizeArgs(args: unknown): string {
	if (args === undefined || args === null) return "";
	if (typeof args !== "object") return firstLine(String(args));
	const record = args as Record<string, unknown>;
	for (const key of ["command", "file_path", "path", "pattern", "query", "url", "name"]) {
		const value = record[key];
		if (typeof value === "string" && value !== "") return firstLine(value);
	}
	const json = JSON.stringify(record);
	return json.length > MAX_ARGUMENT_WIDTH ? `${json.slice(0, MAX_ARGUMENT_WIDTH)}…` : json;
}

export function formatCallLine(toolName: string, args: unknown, theme: Theme): string {
	const summary = summarizeArgs(args);
	const title = theme.fg("toolTitle", `● ${toolName}`);
	return summary === "" ? title : `${title} ${theme.fg("muted", summary)}`;
}

/** Text of a tool result, used when no built-in renderer exists to fall back on. */
function resultText(result: { content?: unknown }): string {
	if (!Array.isArray(result.content)) return "";
	return result.content
		.flatMap((part) => (part && typeof part === "object" && "text" in part ? [String(part.text)] : []))
		.join("\n");
}

function expandedRenderers(builtIn: ToolRenderers): ToolRenderers {
	const { renderCall, renderResult } = builtIn;
	return {
		...builtIn,
		renderCall: renderCall
			? (args, theme, context) => renderCall(args, theme, { ...context, expanded: true })
			: undefined,
		renderResult: renderResult
			? (result, options, theme, context) =>
					renderResult(result, { ...options, expanded: true }, theme, { ...context, expanded: true })
			: undefined,
	};
}

function minimalRenderers(toolName: string, builtIn: ToolRenderers | undefined): ToolRenderers {
	return {
		renderShell: "self",
		renderCall: (args, theme) => new LineComponent(formatCallLine(toolName, args, theme)),
		renderResult: (result, options, theme, context) => {
			const showDetail = options.expanded || context.isError;
			if (!showDetail) return new EmptyComponent();
			if (builtIn?.renderResult) return builtIn.renderResult(result, { ...options, expanded: true }, theme, context);
			const text = resultText(result);
			return new LineComponent(text === "" ? "" : theme.fg("toolOutput", text));
		},
	};
}

/** Renderers that implement the current level; undefined means "use pi's own". */
export function verbosityRenderers(
	level: VerbosityLevel,
	toolName: string,
	builtIn: ToolRenderers | undefined,
): ToolRenderers | undefined {
	if (level === "normal") return undefined;
	if (level === "verbose") return builtIn ? expandedRenderers(builtIn) : undefined;
	return minimalRenderers(toolName, builtIn);
}

export function createVerbosityToolRenderers(getLevel: () => VerbosityLevel): ToolRendererResolver {
	return (toolName, next) => verbosityRenderers(getLevel(), toolName, next());
}