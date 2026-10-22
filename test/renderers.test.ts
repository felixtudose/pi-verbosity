import { strict as assert } from "node:assert";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { openGroup, resetGroups } from "../src/groups.ts";
import { formatCallLine, formatDuration, summarizeArgs, verbosityRenderers } from "../src/renderers.ts";

const THEME = {
	fg: (_color: string, text: string) => text,
} as unknown as Parameters<typeof formatCallLine>[2];

const BUILT_IN_RESULT = { render: () => ["built-in result"], invalidate: () => {} };

function builtInRenderers(calls: { expanded?: boolean }[] = []) {
	return {
		renderResult: (_result: unknown, options: { expanded: boolean }) => {
			calls.push({ expanded: options.expanded });
			return BUILT_IN_RESULT;
		},
	};
}

function context(toolCallId: string, overrides: { expanded?: boolean; isError?: boolean; durationMs?: number } = {}) {
	return { toolCallId, expanded: false, isError: false, durationMs: undefined, ...overrides } as never;
}

const RESULT = { content: [], details: undefined };
const COLLAPSED = { expanded: false, isPartial: false };
const EXPANDED = { expanded: true, isPartial: false };

test("summarizeArgs prefers the command, then a path", () => {
	assert.equal(summarizeArgs({ command: "ls -la\necho hi" }), "ls -la");
	assert.equal(summarizeArgs({ path: "src/engine.ts", offset: 3 }), "src/engine.ts");
	assert.equal(summarizeArgs({ file_path: "/tmp/a" }), "/tmp/a");
	assert.equal(summarizeArgs(undefined), "");
});

test("formatDuration keeps sub-second runs short", () => {
	assert.equal(formatDuration(8), "8ms");
	assert.equal(formatDuration(1750), "1.8s");
	assert.equal(formatDuration(42_000), "42s");
	assert.equal(formatDuration(125_000), "2m 05s");
});

test("formatCallLine shows the tool name and its argument summary", () => {
	assert.equal(formatCallLine("bash", "ls", THEME), "● bash ls");
	assert.equal(formatCallLine("bash", "ls", THEME, true), "⠇ bash ls");
	assert.equal(formatCallLine("todo", "", THEME), "● todo");
});

test("normal level leaves pi's own renderers alone", () => {
	assert.equal(verbosityRenderers("normal", "bash", builtInRenderers()), undefined);
});

test("verbose forces expanded rendering", () => {
	const expandedFlags: { expanded?: boolean }[] = [];
	const renderers = verbosityRenderers("verbose", "bash", builtInRenderers(expandedFlags));
	assert.ok(renderers?.renderResult);
	renderers.renderResult(RESULT, COLLAPSED, THEME, context("c1"));
	assert.deepEqual(expandedFlags, [{ expanded: true }]);
});

test("verbose leaves tools without renderers to pi", () => {
	assert.equal(verbosityRenderers("verbose", "mcp__x__y", undefined), undefined);
});

test("minimal hides the result body until expanded or an error", () => {
	resetGroups();
	const expandedFlags: { expanded?: boolean }[] = [];
	const renderers = verbosityRenderers("minimal", "bash", builtInRenderers(expandedFlags));
	assert.equal(renderers?.renderShell, "self");

	const collapsed = renderers?.renderResult?.(RESULT, COLLAPSED, THEME, context("c1"));
	assert.deepEqual(collapsed?.render(80), []);
	assert.deepEqual(expandedFlags, [], "the built-in renderer is not used while collapsed");

	const expanded = renderers?.renderResult?.(RESULT, EXPANDED, THEME, context("c1", { expanded: true }));
	assert.deepEqual(expanded?.render(80), ["built-in result"]);

	const failed = renderers?.renderResult?.(
		{ content: [{ type: "text", text: "must be string\nsecond line" }], details: undefined },
		COLLAPSED,
		THEME,
		context("c1", { isError: true }),
	);
	assert.deepEqual(failed?.render(80), [], "the call row already shows the error line");
});

test("minimal renders one line per call and shows raw text for tools without renderers", () => {
	resetGroups();
	const renderers = verbosityRenderers("minimal", "mcp__docs__search", undefined);
	assert.equal(renderers?.renderShell, "self");
	const call = renderers?.renderCall?.({ query: "hooks" }, THEME, context("c1") as never);
	renderers?.renderResult?.(RESULT, COLLAPSED, THEME, context("c1", { durationMs: 40 }));
	assert.deepEqual(call?.render(80), ["● mcp__docs__search hooks"]);

	resetGroups();
	const narrow = renderers?.renderCall?.({ query: "hooks" }, THEME, context("c2") as never)?.render(20)[0] ?? "";
	assert.ok(visibleWidth(narrow) <= 20, `narrow call line fits: ${narrow}`);
	assert.ok(narrow.includes("…"), `narrow call line is elided: ${narrow}`);

	const result = renderers?.renderResult?.(
		{ content: [{ type: "text", text: "two\nlines" }], details: undefined },
		EXPANDED,
		THEME,
		context("c1", { expanded: true }),
	);
	assert.deepEqual(result?.render(80), ["two\nlines"]);
});

test("minimal collapses a run of calls into one summary line", () => {
	resetGroups();
	const bash = verbosityRenderers("minimal", "bash", undefined);
	const read = verbosityRenderers("minimal", "read", undefined);
	const first = bash?.renderCall?.({ command: "ls" }, THEME, context("c1") as never);
	const second = bash?.renderCall?.({ command: "pwd" }, THEME, context("c2") as never);
	const third = read?.renderCall?.({ path: "a.ts" }, THEME, context("c3") as never);
	bash?.renderResult?.(RESULT, COLLAPSED, THEME, context("c1", { durationMs: 1000 }));
	bash?.renderResult?.(RESULT, COLLAPSED, THEME, context("c2", { durationMs: 500 }));
	read?.renderResult?.(RESULT, COLLAPSED, THEME, context("c3", { durationMs: 250 }));

	assert.deepEqual(first?.render(80), [], "rows before the last collapse to nothing");
	assert.deepEqual(second?.render(80), []);
	assert.deepEqual(third?.render(80), ["● 3 tools · bash×2, read · 1.8s"]);
});

test("minimal shows a running mark and an error line", () => {
	resetGroups();
	const bash = verbosityRenderers("minimal", "bash", undefined);
	bash?.renderCall?.({ command: "ls" }, THEME, context("c1") as never);
	const failed = bash?.renderCall?.({ command: "pwd" }, THEME, context("c2") as never);
	bash?.renderResult?.(RESULT, COLLAPSED, THEME, context("c1", { durationMs: 300 }));
	bash?.renderResult?.(
		{ content: [{ type: "text", text: 'Validation failed for tool "x":' }], details: undefined },
		COLLAPSED,
		THEME,
		context("c2", { isError: true }),
	);
	assert.deepEqual(failed?.render(80), ["✗ 2 tools · bash×2", '  ✗ bash: Validation failed for tool "x":']);
});

test("minimal puts an error from the middle of the run under the group line", () => {
	resetGroups();
	const bash = verbosityRenderers("minimal", "bash", undefined);
	const first = bash?.renderCall?.({ command: "echo a" }, THEME, context("c1") as never);
	const failing = bash?.renderCall?.({ command: "false" }, THEME, context("c2") as never);
	const last = bash?.renderCall?.({ command: "echo c" }, THEME, context("c3") as never);
	bash?.renderResult?.(RESULT, COLLAPSED, THEME, context("c1", { durationMs: 20 }));
	bash?.renderResult?.(
		{ content: [{ type: "text", text: "exit 1\nnoise" }], details: undefined },
		COLLAPSED,
		THEME,
		context("c2", { durationMs: 30, isError: true }),
	);
	bash?.renderResult?.(RESULT, COLLAPSED, THEME, context("c3", { durationMs: 40 }));

	assert.deepEqual(first?.render(80), []);
	assert.deepEqual(failing?.render(80), []);
	assert.deepEqual(last?.render(80), ["✗ 3 tools · bash×3 · 90ms", "  ✗ bash: exit 1"]);
});

test("minimal shows each line again when the row is expanded", () => {
	resetGroups();
	const bash = verbosityRenderers("minimal", "bash", undefined);
	bash?.renderCall?.({ command: "ls" }, THEME, context("c1") as never);
	const second = bash?.renderCall?.({ command: "pwd" }, THEME, context("c2", { expanded: true }) as never);
	assert.deepEqual(second?.render(80), ["● bash pwd"]);
	openGroup();
});