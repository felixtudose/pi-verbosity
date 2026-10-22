import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideThinking, nextLevel, parseLevel, statusText } from "../src/levels.ts";

test("parseLevel accepts names and aliases", () => {
	assert.equal(parseLevel("minimal"), "minimal");
	assert.equal(parseLevel("MIN"), "minimal");
	assert.equal(parseLevel(" normal "), "normal");
	assert.equal(parseLevel("verbose"), "verbose");
	assert.equal(parseLevel("full"), "verbose");
	assert.equal(parseLevel("rumours"), undefined);
});

test("nextLevel cycles minimal -> normal -> verbose -> minimal", () => {
	assert.equal(nextLevel("minimal"), "normal");
	assert.equal(nextLevel("normal"), "verbose");
	assert.equal(nextLevel("verbose"), "minimal");
});

test("statusText only labels non-default levels", () => {
	assert.equal(statusText("minimal"), "min");
	assert.equal(statusText("normal"), undefined);
	assert.equal(statusText("verbose"), "verbose");
});

test("minimal hides thinking and records the previous value", () => {
	const decision = decideThinking({ level: "normal" }, false, "minimal");
	assert.deepEqual(decision, { state: { level: "minimal", thinkingBefore: false }, hideThinkingBlock: true });
});

test("verbose shows thinking and records the previous value", () => {
	const decision = decideThinking({ level: "normal" }, true, "verbose");
	assert.deepEqual(decision, { state: { level: "verbose", thinkingBefore: true }, hideThinkingBlock: false });
});

test("no thinking write when it already matches the level", () => {
	const decision = decideThinking({ level: "normal" }, true, "minimal");
	assert.deepEqual(decision, { state: { level: "minimal", thinkingBefore: undefined } });
	assert.equal(decision.hideThinkingBlock, undefined);
});

test("switching minimal -> verbose keeps the user's original setting to restore", () => {
	const afterMinimal = decideThinking({ level: "normal" }, false, "minimal");
	assert.equal(afterMinimal.state.thinkingBefore, false);
	const afterVerbose = decideThinking(afterMinimal.state, true, "verbose");
	assert.equal(afterVerbose.state.thinkingBefore, false);
	assert.equal(afterVerbose.hideThinkingBlock, false);

	const backToNormal = decideThinking(afterVerbose.state, false, "normal");
	assert.deepEqual(backToNormal, { state: { level: "normal" } });
	assert.equal(backToNormal.hideThinkingBlock, undefined, "nothing to restore: already at the original value");
});

test("returning to normal restores the setting a level changed", () => {
	const afterVerbose = decideThinking({ level: "normal" }, true, "verbose");
	assert.equal(afterVerbose.hideThinkingBlock, false);
	const backToNormal = decideThinking(afterVerbose.state, false, "normal");
	assert.deepEqual(backToNormal, { state: { level: "normal" }, hideThinkingBlock: true });
});

test("normal never writes thinking when the user never changed it", () => {
	assert.deepEqual(decideThinking({ level: "normal" }, true, "normal"), { state: { level: "normal" } });
});