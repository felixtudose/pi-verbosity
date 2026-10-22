import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openGroup, prepareGroups, type HistoryMessage } from "./src/groups.ts";
import {
	LEVELS,
	LEVEL_DESCRIPTIONS,
	decideThinking,
	nextLevel,
	parseLevel,
	statusText,
	type VerbosityLevel,
	type VerbosityState,
} from "./src/levels.ts";
import { createVerbosityToolRenderers } from "./src/renderers.ts";
import { readState, setHideThinkingBlock, writeState } from "./src/store.ts";

const STATUS_KEY = "verbosity";

export default function (pi: ExtensionAPI) {
	let state: VerbosityState = readState();

	pi.registerToolRenderer(createVerbosityToolRenderers(() => state.level));

	pi.on("session_start", async (_event, ctx) => {
		prepareGroups(sessionMessages(ctx));
		applyStatus(ctx);
		applyThinkingLabel(ctx);
		await enforceThinkingLevel(ctx);
	});

	// A new assistant message ends the previous run of tool calls, so the next call
	// starts a fresh group even when the model interleaves text and tools.
	pi.on("message_start", (event) => {
		if (event.message.role === "assistant") openGroup();
	});

	pi.registerCommand("verbosity", {
		description: "Set how much of the transcript is shown: minimal, normal or verbose",
		handler: async (args, ctx) => {
			const requested = args.trim();
			const previous = state.level;
			const target = requested === "" ? await pickLevel(ctx, previous) : requested === "next" ? nextLevel(previous) : parseLevel(requested);
			if (target === undefined) {
				ctx.ui.notify(`Unknown verbosity "${requested}". Use minimal, normal or verbose, or "next".`, "warning");
				return;
			}

			const decision = decideThinking(state, pi.getSettings().hideThinkingBlock ?? false, target);
			state = decision.state;
			writeState(state);
			if (decision.hideThinkingBlock !== undefined) {
				await setHideThinkingBlock(ctx.cwd, decision.hideThinkingBlock);
			}

			applyStatus(ctx);
			applyThinkingLabel(ctx);
			if (target === previous) {
				ctx.ui.notify(`Verbosity already ${target}: ${LEVEL_DESCRIPTIONS[target]}`, "info");
				return;
			}
			ctx.ui.notify(`Verbosity: ${target} (${LEVEL_DESCRIPTIONS[target]})`, "info");
			// Rendering and thinking-block visibility are fixed per rendered row, so
			// rebuild the transcript against the new level.
			await ctx.reload();
		},
	});

	function applyStatus(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		ctx.ui.setStatus(STATUS_KEY, statusText(state.level));
	}

	/**
	 * pi draws a one-line "Thinking..." placeholder for every hidden thinking run.
	 * minimal has no room for it, and an empty label makes pi's Text render no rows.
	 */
	function applyThinkingLabel(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		ctx.ui.setHiddenThinkingLabel(state.level === "minimal" ? "" : undefined);
	}

	/** Apply the stored level's thinking rule on startup, not only when the command runs. */
	async function enforceThinkingLevel(ctx: ExtensionContext): Promise<void> {
		if (state.level === "normal") return;
		const decision = decideThinking(state, pi.getSettings().hideThinkingBlock ?? false, state.level);
		state = decision.state;
		writeState(state);
		if (decision.hideThinkingBlock !== undefined) {
			await setHideThinkingBlock(ctx.cwd, decision.hideThinkingBlock);
		}
	}
}

function sessionMessages(ctx: ExtensionContext): HistoryMessage[] {
	const messages: HistoryMessage[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message") messages.push(entry.message as HistoryMessage);
	}
	return messages;
}

async function pickLevel(ctx: ExtensionContext, current: VerbosityLevel): Promise<VerbosityLevel | undefined> {
	const options = LEVELS.map((level) => `${level === current ? "* " : "  "}${level} — ${LEVEL_DESCRIPTIONS[level]}`);
	const choice = await ctx.ui.select("Verbosity", options);
	if (choice === undefined) return undefined;
	const name = choice.trim().replace(/^\*\s*/, "").split(" ")[0] ?? "";
	return parseLevel(name);
}