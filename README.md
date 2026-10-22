# pi-verbosity

Transcript verbosity levels for [pi](https://pi.dev), controlled by `/verbosity`.

pi has no single density setting — it exposes separate knobs (`hideThinkingBlock`,
`ctrl+o` for tool output, the fullscreen footer, themes). This extension turns the
most useful combination of them into three levels you can switch with one command.

## Install

```bash
pi install git:github.com/felixtudose/pi-verbosity
```

Or load it for a single run:

```bash
pi -e /path/to/pi-verbosity/index.ts
```

## Levels

| Level | Tool call | Tool result | Thinking |
|---|---|---|---|
| `minimal` | one line per *group* of consecutive calls: `● bash ls` for a single call, `● 4 tools · bash×2, read · 1.8s` for a run | hidden; errors get one compact line, `ctrl+o` expands the row | hidden |
| `normal` | pi default | pi default (truncated, `ctrl+o` expands) | your own setting, untouched |
| `verbose` | always fully expanded | always fully expanded | shown |

## Usage

```
/verbosity            # pick a level from a list
/verbosity minimal
/verbosity verbose
/verbosity normal     # pi defaults
/verbosity next       # cycle minimal -> normal -> verbose -> minimal
```

Aliases: `min`, `quiet` → `minimal`; `default` → `normal`; `full`, `loud` → `verbose`.
While a non-default level is active, the footer shows `min` or `verbose`.

The level is remembered in `<agent-dir>/verbosity.json`. Every session applies it
on startup, including `pi -p` and RPC runs, and the transcript history is
re-grouped from the session branch so a resumed session looks the same as a live
one.

## Grouping

In `minimal`, consecutive tool calls collapse into a single transcript line:
`⠇ 2 tools · bash, read` while they run, then `● 2 tools · bash, read · 1.4s` once
they finish. Earlier rows of the group render with no height at all, so a ten-call
turn costs one line instead of ten, whether the model issued the calls in parallel
or one after another — only prose or a new user message starts a new group. Errors
add one short `✗ tool: first line of the error` line, and `ctrl+o` expands a row to
the per-call lines with their output.

## What it changes in pi's settings

`minimal` sets `hideThinkingBlock: true` and `verbose` sets it to `false`, because
pi only exposes thinking-block visibility as a setting. The value you had before
the first level change is remembered and restored by `/verbosity normal`, so a
round trip never leaves your settings different from where they started. The
command rewrites the global settings file and then runs pi's own reload, which
rebuilds the transcript so existing rows render at the new level.

pi also draws a one-line italic `Thinking...` placeholder for every hidden thinking
run. In `minimal` the extension blanks that label (`ctx.ui.setHiddenThinkingLabel("")`),
which makes pi render no rows at all for hidden thinking; the other levels keep
pi's placeholder.

`normal` never writes to your settings on its own.

## Development

```bash
npm install
npm test
npm run typecheck
```

## License

MIT