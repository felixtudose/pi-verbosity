import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	entryFor,
	groupFor,
	groupStats,
	isLastInGroup,
	openGroup,
	prepareGroups,
	registerCall,
	resetGroups,
	settleCall,
} from "../src/groups.ts";

function assistant(...toolCalls: Array<{ id: string; name: string }>) {
	return {
		role: "assistant",
		content: toolCalls.map((call) => ({ type: "toolCall", ...call, arguments: {} })),
	};
}

test("calls registered after openGroup join a fresh group", () => {
	resetGroups();
	registerCall("a", "bash", "ls");
	openGroup();
	registerCall("b", "read", "x.ts");
	const groupA = groupFor("a");
	const groupB = groupFor("b");
	assert.notEqual(groupA, groupB);
	assert.equal(groupA?.entries.length, 1);
	assert.equal(groupB?.entries.length, 1);
});

test("only the newest call of a group is last", () => {
	resetGroups();
	registerCall("a", "bash", "ls");
	registerCall("b", "bash", "pwd");
	assert.equal(isLastInGroup("a"), false);
	assert.equal(isLastInGroup("b"), true);
});

test("registering the same call twice keeps one entry", () => {
	resetGroups();
	const first = registerCall("a", "bash", "ls");
	const second = registerCall("a", "bash", "ls");
	assert.equal(first, second);
	assert.equal(groupFor("a")?.entries.length, 1);
});

test("settleCall records the duration and error text", () => {
	resetGroups();
	registerCall("a", "bash", "ls");
	settleCall("a", 1200, "boom");
	const entry = entryFor("a");
	assert.equal(entry?.settled, true);
	assert.equal(entry?.durationMs, 1200);
	assert.equal(entry?.errorText, "boom");
});

test("groupStats counts names, errors, running state and total runtime", () => {
	resetGroups();
	registerCall("a", "bash", "ls");
	settleCall("a", 1000);
	registerCall("b", "bash", "pwd");
	settleCall("b", 500);
	registerCall("c", "read", "x.ts");
	settleCall("c", 250, "missing");
	const group = groupFor("a");
	assert.ok(group);
	const stats = groupStats(group);
	assert.deepEqual(stats.names, [
		{ name: "bash", count: 2 },
		{ name: "read", count: 1 },
	]);
	assert.equal(stats.errorCount, 1);
	assert.equal(stats.running, false);
	assert.equal(stats.durationMs, 1750);
});

test("an unsettled call marks the group as running and hides the total", () => {
	resetGroups();
	registerCall("a", "bash", "ls");
	settleCall("a", 1000);
	registerCall("b", "bash", "sleep 5");
	const stats = groupStats(groupFor("a")!);
	assert.equal(stats.running, true);
	assert.equal(stats.durationMs, undefined);
});

test("prepareGroups splits history by assistant message and marks it settled", () => {
	resetGroups();
	prepareGroups([
		{ role: "user", content: [{ type: "text", text: "go" }] },
		assistant({ id: "a", name: "bash" }, { id: "b", name: "read" }),
		{ role: "toolResult", content: [] },
		assistant({ id: "c", name: "bash" }),
	]);
	assert.equal(groupFor("a"), groupFor("b"));
	assert.notEqual(groupFor("a"), groupFor("c"));
	assert.equal(isLastInGroup("b"), true);
	assert.equal(isLastInGroup("c"), true);
	assert.equal(entryFor("a")?.settled, true);
	assert.equal(groupStats(groupFor("a")!).durationMs, undefined);
});

test("a text-only assistant message starts the next group", () => {
	resetGroups();
	prepareGroups([assistant({ id: "a", name: "bash" }), assistant(), assistant({ id: "b", name: "read" })]);
	assert.notEqual(groupFor("a"), groupFor("b"));
});

test("live calls after history join the last history group", () => {
	resetGroups();
	prepareGroups([assistant({ id: "a", name: "bash" })]);
	registerCall("b", "read", "x.ts");
	assert.equal(groupFor("a"), groupFor("b"));
});