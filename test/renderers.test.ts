import { strict as assert } from "node:assert";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatCallLine, summarizeArgs, verbosityRenderers } from "../src/renderers.ts";

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

function context(overrides: { expanded?: boolean; isError?: boolean } = {}) {
	return { expanded: false, isError: false, ...overrides } as never;
}

test("summarizeArgs prefers the command, then a path", () => {
	assert.equal(summarizeArgs({ command: "ls -la\necho hi" }), "ls -la");
	assert.equal(summarizeArgs({ path: "src/engine.ts", offset: 3 }), "src/engine.ts");
	assert.equal(summarizeArgs({ file_path: "/tmp/a" }), "/tmp/a");
	assert.equal(summarizeArgs(undefined), "");
});

test("formatCallLine shows the tool name and its argument summary", () => {
	assert.equal(formatCallLine("bash", { command: "ls" }, THEME), "● bash ls");
	assert.equal(formatCallLine("todo", {}, THEME), '● todo {"}'.replace('{"}', "{}"));
});

test("normal level leaves pi's own renderers alone", () => {
	const builtIn = builtInRenderers();
	assert.equal(verbosityRenderers("normal", "bash", builtIn), undefined);
});

test("verbose forces expanded rendering", () => {
	const expandedFlags: { expanded?: boolean }[] = [];
	const renderers = verbosityRenderers("verbose", "bash", builtInRenderers(expandedFlags));
	assert.ok(renderers?.renderResult);
	renderers.renderResult({ content: [], details: undefined }, { expanded: false, isPartial: false }, THEME, context());
	assert.deepEqual(expandedFlags, [{ expanded: true }]);
});

test("verbose leaves tools without renderers to pi", () => {
	assert.equal(verbosityRenderers("verbose", "mcp__x__y", undefined), undefined);
});

test("minimal hides the result body until expanded or an error", () => {
	const expandedFlags: { expanded?: boolean }[] = [];
	const renderers = verbosityRenderers("minimal", "bash", builtInRenderers(expandedFlags));
	assert.equal(renderers?.renderShell, "self");

	const collapsed = renderers?.renderResult?.({ content: [], details: undefined }, { expanded: false, isPartial: false }, THEME, context());
	assert.deepEqual(collapsed?.render(80), []);
	assert.deepEqual(expandedFlags, [], "the built-in renderer is not used while collapsed");

	const expanded = renderers?.renderResult?.({ content: [], details: undefined }, { expanded: true, isPartial: false }, THEME, context({ expanded: true }));
	assert.deepEqual(expanded?.render(80), ["built-in result"]);

	const failed = renderers?.renderResult?.({ content: [], details: undefined }, { expanded: false, isPartial: false }, THEME, context({ isError: true }));
	assert.deepEqual(failed?.render(80), ["built-in result"], "errors stay visible");
});

test("minimal renders a one-line call and shows raw text for tools without renderers", () => {
	const renderers = verbosityRenderers("minimal", "mcp__docs__search", undefined);
	assert.equal(renderers?.renderShell, "self");
	const call = renderers?.renderCall?.({ query: "hooks" }, THEME, context() as never);
	assert.deepEqual(call?.render(80), ["● mcp__docs__search hooks"]);

	const args = { query: "hooks" };
	const narrow = renderers?.renderCall?.(args, THEME, context() as never)?.render(20)[0] ?? "";
	assert.ok(visibleWidth(narrow) <= 20, `narrow call line fits: ${narrow}`);
	assert.ok(narrow.includes("…"), `narrow call line is elided: ${narrow}`);

	const result = renderers?.renderResult?.(
		{ content: [{ type: "text", text: "two\nlines" }], details: undefined },
		{ expanded: true, isPartial: false },
		THEME,
		context({ expanded: true }),
	);
	assert.deepEqual(result?.render(80), ["two\nlines"]);
});