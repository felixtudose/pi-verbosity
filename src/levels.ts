/**
 * Verbosity levels and the rule for how each level maps onto pi's own
 * thinking-block setting. Pure logic, so it is covered by `node --test`.
 */

export type VerbosityLevel = "minimal" | "normal" | "verbose";

export const LEVELS: readonly VerbosityLevel[] = ["minimal", "normal", "verbose"];

export const LEVEL_DESCRIPTIONS: Record<VerbosityLevel, string> = {
	minimal: "one line per group of tool calls, thinking hidden",
	normal: "pi defaults: truncated output you can expand",
	verbose: "tool output always expanded, thinking shown",
};

const ALIASES: Record<string, VerbosityLevel> = {
	min: "minimal",
	minimal: "minimal",
	quiet: "minimal",
	normal: "normal",
	default: "normal",
	verbose: "verbose",
	full: "verbose",
	loud: "verbose",
};

export function parseLevel(input: string): VerbosityLevel | undefined {
	return ALIASES[input.trim().toLowerCase()];
}

export function nextLevel(level: VerbosityLevel): VerbosityLevel {
	const index = LEVELS.indexOf(level);
	return LEVELS[(index + 1) % LEVELS.length] as VerbosityLevel;
}

export interface VerbosityState {
	level: VerbosityLevel;
	/**
	 * The `hideThinkingBlock` value the user had before a level change touched
	 * it, restored when the level goes back to normal.
	 */
	thinkingBefore?: boolean;
}

export interface ThinkingDecision {
	state: VerbosityState;
	/** Value to write into pi's `hideThinkingBlock`, or undefined to leave it alone. */
	hideThinkingBlock?: boolean;
}

/**
 * Decide whether a level change must also change pi's thinking-block visibility.
 * `minimal` hides thinking and `verbose` shows it; `normal` restores whatever the
 * user had configured, so switching levels never silently rewrites their setting.
 */
export function decideThinking(
	state: VerbosityState,
	currentHidden: boolean,
	target: VerbosityLevel,
): ThinkingDecision {
	const thinkingBefore = state.thinkingBefore ?? currentHidden;
	if (target === "normal") {
		const restore = state.thinkingBefore;
		if (restore === undefined || restore === currentHidden) return { state: { level: target } };
		return { state: { level: target }, hideThinkingBlock: restore };
	}
	const desiredHidden = target === "minimal";
	if (desiredHidden === currentHidden) return { state: { level: target, thinkingBefore: state.thinkingBefore } };
	return { state: { level: target, thinkingBefore }, hideThinkingBlock: desiredHidden };
}

export function statusText(level: VerbosityLevel): string | undefined {
	if (level === "minimal") return "min";
	if (level === "verbose") return "verbose";
	return undefined;
}