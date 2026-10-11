# claude-mod

Mods for Claude Code. Each one is a plugin in its own folder under `plugins/`.

| Mod | What it does |
| --- | --- |
| [md-preview](plugins/md-preview/README.md) | Previews markdown files in a pane, from a command or by Claude's own choice |

## Install a mod

In a terminal Claude Code session (2.1.275 or later):

```
/plugin install md-preview --marketplace danielmertens/Claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Choose the user scope to have the mod in every session, including the local session the Claude desktop app starts for its Code tab. `/plugin install` itself is not available in the desktop app, so install from a terminal.

## Run a mod

Load one from its folder for a single session:

```
claude --plugin-dir plugins/md-preview
```

Repeat `--plugin-dir` to load several. An interactive session reloads a mod when its files are saved.

## Check a mod

```
claude plugin validate plugins/md-preview
claude plugin test plugins/md-preview
```

## Add a mod

Create `plugins/<name>/` with three files:

- `.claude-plugin/plugin.json`: `{ "name": "<name>", "version": "0.1.0", "description": "<one line>" }`
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`
- `hooks/register.tsx`: the hooks module, exporting `register`

Then add a `README.md` beside them and a row to the table above.

The mod API is early access and can change between Claude Code releases. These mods were written against 2.1.296.
