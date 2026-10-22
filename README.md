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
| `minimal` | one line: tool name + command/path | hidden; still shown for errors or when you expand with `ctrl+o` | hidden |
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

The level is remembered in `<agent-dir>/verbosity.json` and applies to every
session, including `pi -p` and RPC runs.

## What it changes in pi's settings

`minimal` sets `hideThinkingBlock: true` and `verbose` sets it to `false`, because
pi only exposes thinking-block visibility as a setting. The value you had before
the first level change is remembered and restored by `/verbosity normal`, so a
round trip never leaves your settings different from where they started. The
command rewrites the global settings file and then runs pi's own reload, which
rebuilds the transcript so existing rows render at the new level.

`normal` never writes to your settings on its own.

## Development

```bash
npm install
npm test
npm run typecheck
```

## License

MIT