import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readState, stateFilePath, writeState } from "../src/store.ts";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "pi-verbosity-"));
}

test("a missing state file means the default level", () => {
	assert.deepEqual(readState(join(tempDir(), "verbosity.json")), { level: "normal" });
});

test("state round-trips through the file", () => {
	const path = stateFilePath(tempDir());
	writeState({ level: "minimal", thinkingBefore: false }, path);
	assert.deepEqual(readState(path), { level: "minimal", thinkingBefore: false });
});

test("an unknown level falls back to normal but keeps the restore value", () => {
	const path = join(tempDir(), "verbosity.json");
	writeFileSync(path, JSON.stringify({ level: "shouty", thinkingBefore: true }));
	assert.deepEqual(readState(path), { level: "normal", thinkingBefore: true });
});

test("state filename lives in the agent directory", () => {
	assert.match(stateFilePath("/tmp/agent"), /\/tmp\/agent\/verbosity\.json$/);
	const path = stateFilePath(tempDir());
	writeState({ level: "verbose" }, path);
	assert.match(readFileSync(path, "utf8"), /"level": "verbose"/);
});