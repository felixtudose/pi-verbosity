/**
 * Consecutive tool calls in one assistant message collapse into a single transcript
 * line in minimal mode. Each row asks this registry whether it is the last member of
 * its group: earlier rows render with zero height, the last one draws the summary.
 *
 * A run of tool calls with no prose in between is one group, even when pi splits it
 * across several assistant messages: a user message or assistant text starts the
 * next group. History is registered up front from the session branch, because
 * restored rows are rendered without replaying the events that split groups live.
 */

export interface GroupEntry {
	id: string;
	toolName: string;
	summary: string;
	startedAt: number;
	durationMs: number | undefined;
	settled: boolean;
	errorText: string | undefined;
}

export interface ToolGroup {
	entries: GroupEntry[];
}

export interface GroupStats {
	count: number;
	names: Array<{ name: string; count: number }>;
	errorCount: number;
	running: boolean;
	/** Total runtime, only when every entry reported a duration. */
	durationMs: number | undefined;
}

let groups: ToolGroup[] = [];
let groupByEntryId = new Map<string, ToolGroup>();
let entryById = new Map<string, GroupEntry>();

export function resetGroups(): void {
	groups = [];
	groupByEntryId = new Map();
	entryById = new Map();
}

/** Start a new group; tool calls registered from now on join it. */
export function openGroup(): void {
	groups.push({ entries: [] });
}

export function registerCall(id: string, toolName: string, summary: string, settled = false): GroupEntry {
	const existing = entryById.get(id);
	if (existing) return existing;
	if (groups.length === 0) openGroup();
	const group = groups[groups.length - 1] as ToolGroup;
	const entry: GroupEntry = { id, toolName, summary, startedAt: Date.now(), durationMs: undefined, settled, errorText: undefined };
	group.entries.push(entry);
	groupByEntryId.set(id, group);
	entryById.set(id, entry);
	return entry;
}

export function entryFor(id: string): GroupEntry | undefined {
	return entryById.get(id);
}

export function groupFor(id: string): ToolGroup | undefined {
	return groupByEntryId.get(id);
}

export function isLastInGroup(id: string): boolean {
	const group = groupByEntryId.get(id);
	if (!group) return true;
	const last = group.entries[group.entries.length - 1];
	return last !== undefined && last.id === id;
}

export function settleCall(id: string, durationMs: number | undefined, errorText?: string): void {
	const entry = entryById.get(id);
	if (!entry) return;
	entry.settled = true;
	entry.durationMs = durationMs;
	if (errorText !== undefined) entry.errorText = errorText;
}

export function groupStats(group: ToolGroup): GroupStats {
	const counts = new Map<string, number>();
	let durationMs = 0;
	let everyDurationKnown = true;
	let errorCount = 0;
	let running = false;
	for (const entry of group.entries) {
		counts.set(entry.toolName, (counts.get(entry.toolName) ?? 0) + 1);
		if (entry.errorText !== undefined) errorCount += 1;
		if (!entry.settled) running = true;
		if (entry.durationMs === undefined) everyDurationKnown = false;
		else durationMs += entry.durationMs;
	}
	return {
		count: group.entries.length,
		names: [...counts].map(([name, count]) => ({ name, count })),
		errorCount,
		running,
		durationMs: everyDurationKnown && group.entries.length > 0 ? durationMs : undefined,
	};
}

export interface HistoryMessage {
	role?: string;
	content?: unknown;
}

/** Tool-only assistant messages continue the previous group; anything else starts one. */
export function startsGroup(message: HistoryMessage): boolean {
	if (message.role === "user") return true;
	if (message.role !== "assistant") return false;
	return hasVisibleText(message);
}

function hasVisibleText(message: HistoryMessage): boolean {
	if (!Array.isArray(message.content)) return false;
	return message.content.some((part) => {
		if (!part || typeof part !== "object") return false;
		const block = part as { type?: string; text?: unknown };
		return block.type === "text" && typeof block.text === "string" && block.text.trim() !== "";
	});
}

interface ToolCallBlock {
	type: string;
	id?: unknown;
	name?: unknown;
}

/** Register the tool calls of every assistant message in `messages` as its own group. */
export function prepareGroups(messages: readonly HistoryMessage[]): void {
	resetGroups();
	for (const message of messages) {
		if (startsGroup(message)) openGroup();
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content as ToolCallBlock[]) {
			if (part?.type !== "toolCall" || typeof part.id !== "string" || typeof part.name !== "string") continue;
			registerCall(part.id, part.name, "", true);
		}
	}
}