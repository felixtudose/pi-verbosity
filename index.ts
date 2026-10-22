import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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

	pi.on("session_start", (_event, ctx) => {
		applyStatus(ctx);
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
}

async function pickLevel(ctx: ExtensionContext, current: VerbosityLevel): Promise<VerbosityLevel | undefined> {
	const options = LEVELS.map((level) => `${level === current ? "* " : "  "}${level} — ${LEVEL_DESCRIPTIONS[level]}`);
	const choice = await ctx.ui.select("Verbosity", options);
	if (choice === undefined) return undefined;
	const name = choice.trim().replace(/^\*\s*/, "").split(" ")[0] ?? "";
	return parseLevel(name);
}