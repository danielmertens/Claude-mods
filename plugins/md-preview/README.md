# md-preview

A Claude Code mod that previews markdown files in a pane, rendered as they stand on disk now.

## Use

- `/md-preview` lists the last five markdown files edited in the session, newest first. Pick one with its number or Enter to preview it. With a single file in the list, the preview opens at once.
- `/md-preview <path>` previews any markdown file.
- Claude can show a file itself through the `mcp__md-preview__show` tool.

In the preview, `b` goes back to the list, `r` reads the file again, and `q` or Esc closes it. An open preview follows the file when Claude edits it again.

## Limits

- Only edits made with the Edit and Write tools are tracked. A file changed by a shell command is not in the list, but `/md-preview <path>` still previews it.
- A preview Claude opens through the tool is placed only on a terminal at least 144 columns wide, or 110 once you have opened the pane yourself. Below that a toast names the `/md-preview <path>` command that opens it.
- Files Claude shows through the tool do not join the list.

## Run

From the repository root:

```
claude --plugin-dir plugins/md-preview
```

## Check

```
claude plugin validate plugins/md-preview
claude plugin test plugins/md-preview
```

## Layout

| Path | Holds |
| --- | --- |
| `.claude-plugin/plugin.json` | The manifest |
| `hooks/register.tsx` | The hooks: the command, the tool, edit tracking and the pane |
| `hooks/paths.ts` | Path and text helpers |
| `types/index.d.ts` | The state the mod keeps for the session |
| `tests/md-preview.test.ts` | Tests, run by `claude plugin test` |
