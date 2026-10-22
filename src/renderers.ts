/**
 * Tool renderers for the `minimal` and `verbose` levels.
 *
 * `minimal` draws one line per group of consecutive tool calls (see `groups.ts`) and
 * shows output only for errors or when the row is expanded. Tool components pick
 * their renderers once, when the tool call is created, so a level change re-renders
 * the transcript through `/reload` rather than mutating components in place.
 */
import type { Theme, ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { VerbosityLevel } from "./levels.ts";
import { entryFor, groupFor, groupStats, isLastInGroup, registerCall, settleCall, type ToolGroup } from "./groups.ts";

const MAX_ARGUMENT_WIDTH = 200;
const RUNNING_MARK = "⠇";

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

export function formatCallLine(toolName: string, summary: string, theme: Theme, running = false): string {
	const title = theme.fg("toolTitle", `${running ? RUNNING_MARK : "●"} ${toolName}`);
	return summary === "" ? title : `${title} ${theme.fg("muted", summary)}`;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
	const seconds = ms / 1000;
	if (seconds < 10) return `${seconds.toFixed(1)}s`;
	if (seconds < 60) return `${Math.round(seconds)}s`;
	return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

/** One line for a whole group: `● 4 tools · bash×2, read · 2.1s`. */
export function groupLine(group: ToolGroup, theme: Theme): string {
	const stats = groupStats(group);
	if (stats.count === 1) {
		const only = group.entries[0]!;
		const errorMark = only.errorText !== undefined && !stats.running;
		const mark = stats.running ? RUNNING_MARK : errorMark ? "✗" : "●";
		const title = theme.fg(errorMark ? "error" : "toolTitle", `${mark} ${only.toolName}`);
		return only.summary === "" ? title : `${title} ${theme.fg("muted", only.summary)}`;
	}
	const mark = stats.running ? RUNNING_MARK : stats.errorCount > 0 ? "✗" : "●";
	const names = stats.names.map(({ name, count }) => (count > 1 ? `${name}×${count}` : name)).join(", ");
	const parts = [`${mark} ${stats.count} tools`, names];
	if (stats.durationMs !== undefined) parts.push(formatDuration(stats.durationMs));
	return `${theme.fg(stats.errorCount > 0 && !stats.running ? "error" : "dim", parts.join(" · "))}`;
}

class GroupRow implements Component {
	private readonly entryId: string;
	private readonly expanded: boolean;
	private readonly theme: Theme;
	private readonly toolName: string;
	private readonly summary: string;

	constructor(entryId: string, toolName: string, summary: string, expanded: boolean, theme: Theme) {
		this.entryId = entryId;
		this.toolName = toolName;
		this.summary = summary;
		this.expanded = expanded;
		this.theme = theme;
	}

	render(width: number): string[] {
		// A reload can reset the registry while rows still hold their ids, so re-register
		// rather than dropping the row from the transcript.
		const entry = entryFor(this.entryId) ?? registerCall(this.entryId, this.toolName, this.summary);
		const group = groupFor(this.entryId);
		if (!group) return [];
		if (this.expanded) {
			return [truncateToWidth(formatCallLine(entry.toolName, entry.summary, this.theme), Math.max(1, width), "…")];
		}
		// Only the newest row of a group draws anything; the rest keep zero height, so a
		// long run of calls stays one summary line with its errors underneath.
		if (!isLastInGroup(this.entryId)) return [];
		const lines = [truncateToWidth(groupLine(group, this.theme), Math.max(1, width), "…")];
		for (const failed of group.entries) {
			if (failed.errorText === undefined) continue;
			const text = `  ${this.theme.fg("error", `✗ ${failed.toolName}: ${firstLine(failed.errorText)}`)}`;
			lines.push(truncateToWidth(text, Math.max(1, width), "…"));
		}
		return lines;
	}

	invalidate(): void {}
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
		renderCall: (args, theme, context) => {
			const summary = summarizeArgs(args);
			const entry = registerCall(context.toolCallId, toolName, summary);
			return new GroupRow(entry.id, toolName, summary, context.expanded, theme);
		},
		renderResult: (result, options, theme, context) => {
			const errorText = context.isError ? firstLine(resultText(result)) : undefined;
			settleCall(context.toolCallId, context.durationMs, errorText);
			// Collapsed rows draw their own one-line summary, including a compact error
			// line, so nothing of the result body is repeated underneath.
			if (!options.expanded) return new EmptyComponent();
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