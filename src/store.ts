/**
 * Persistence for the verbosity level, plus the one pi setting a level touches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { parseLevel, type VerbosityState } from "./levels.ts";

const STATE_FILENAME = "verbosity.json";

export function stateFilePath(agentDir = getAgentDir()): string {
	return join(agentDir, STATE_FILENAME);
}

export function readState(path = stateFilePath()): VerbosityState {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { level: "normal" };
		throw error;
	}
	const parsed = JSON.parse(raw) as { level?: string; thinkingBefore?: unknown };
	const level = parseLevel(parsed.level ?? "") ?? "normal";
	const thinkingBefore = typeof parsed.thinkingBefore === "boolean" ? parsed.thinkingBefore : undefined;
	return { level, thinkingBefore };
}

export function writeState(state: VerbosityState, path = stateFilePath()): void {
	writeFileSync(path, `${JSON.stringify(state, null, "\t")}\n`);
}

/** Write `hideThinkingBlock` into the global pi settings file. */
export async function setHideThinkingBlock(cwd: string, hidden: boolean): Promise<void> {
	const manager = SettingsManager.create(cwd, getAgentDir());
	manager.setHideThinkingBlock(hidden);
	await manager.flush();
}