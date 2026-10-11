import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileView, View } from '../types'
import {
  absolute,
  argOf,
  clean,
  isMarkdown,
  isSameFile,
  labelOf,
  nameOf,
  remember,
} from './paths'

const PANE = 'md-preview'
const COMMAND = 'md-preview'
const TOOL = 'mcp__md-preview__show'
const MAX_ROWS = 30

const recent = atom({ plugin: 'md-preview', key: 'recent' } as const, [])
const view = atom({ plugin: 'md-preview', key: 'view' } as const, null)

const load = async ($: EngineInterface, path: string): Promise<FileView> => {
  try {
    return { kind: 'file', path, text: clean(await $.fs.read(path)), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reason = message.includes('ENOENT') ? 'no such file' : message

    return { kind: 'file', path, text: '', error: reason }
  }
}

// Opens the preview on the file as it stands on disk now. `isAsked` says the
// person is behind the open, which is when the pane may take the keyboard.
const show = async ($: EngineInterface, given: string, isAsked: boolean) => {
  const path = absolute(given, await $.session.cwd())
  const file = await load($, path)

  if (file.error !== null) {
    return { failed: `Could not read ${given}: ${file.error}` }
  }

  await update($, view, (): View => file)

  return $.ui.open({
    id: PANE,
    title: `Preview: ${nameOf(path)}`,
    closeOnEscape: true,
    rows: Math.min(file.text.split('\n').length + 2, MAX_ROWS),
    ...(isAsked ? { focus: true as const } : {}),
  })
}

const pick = async ($: EngineInterface, count: number) => {
  await update($, view, (): View => ({ kind: 'list' }))

  return $.ui.open({
    id: PANE,
    title: 'Markdown preview',
    focus: true,
    closeOnEscape: true,
    holdToasts: true,
    rows: count + 2,
  })
}

const press = async ($: EngineInterface, path: string) => {
  const opened = await show($, path, true)

  if ('failed' in opened) {
    $.ui.toast(opened.failed)
  }
}

const reload = async ($: EngineInterface) => {
  const current = await read($, view)

  if (current?.kind === 'file') {
    const file = await load($, current.path)
    await update($, view, (): View => file)
  }
}

const noteEdit = async ($: EngineInterface, given: string) => {
  const path = absolute(given, await $.session.cwd())
  await update($, recent, list => remember(list, path))
  const current = await read($, view)

  if (current?.kind === 'file' && isSameFile(current.path, path)) {
    await reload($)
  }
}

// A resumed session, or a mod loaded mid-session, starts from the edits the
// transcript already holds.
const seed = async ($: EngineInterface) => {
  if ((await read($, recent)).length > 0) {
    return
  }

  const cwd = await $.session.cwd()
  let found: string[] = []

  for (const message of await $.session.messages()) {
    for (const use of message.toolUses) {
      const path = use.input.file_path
      const isEdit = use.tool === 'Edit' || use.tool === 'Write'
      const hasRun = use.text !== undefined && use.isError !== true

      if (isEdit && hasRun && typeof path === 'string' && isMarkdown(path)) {
        found = remember(found, absolute(path, cwd))
      }
    }
  }

  if (found.length > 0) {
    await update($, recent, () => found)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'md-preview',
      description: 'Preview a markdown file edited in this session',
      argumentHint: '[path]',
    })
    await $.tool.register({
      name: 'show',
      description:
        'Shows the user a rendered preview of a markdown file in a pane beside the conversation, as the file stands on disk now. Use it when the user should read a markdown file you wrote or changed. The result says whether the preview is on screen; it does not return the file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The markdown file to show (.md), absolute or relative to the working directory',
          },
        },
        required: ['file_path'],
      },
      isDeferred: false,
    })
    await seed($)

    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    const hasRun = ran.deny === undefined && ran.isError !== true

    if (hasRun && isMarkdown(e.file_path)) {
      await noteEdit($, e.file_path)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const path = typeof e.file_path === 'string' ? e.file_path.trim() : ''

    if (!isMarkdown(path)) {
      return { deny: `${$.plugin.name}: file_path must name a markdown file (.md).` }
    }

    const opened = await show($, path, false)

    if ('failed' in opened) {
      return { deny: `${$.plugin.name}: ${opened.failed}` }
    }

    if (!opened.isPlaced) {
      $.ui.toast(`A preview of ${nameOf(path)} is ready: /${COMMAND} ${path}`)

      return {
        result: `The preview of ${path} is ready but not on screen (${opened.reason}). The user can open it with /${COMMAND} ${path}.`,
      }
    }

    return { result: `The user now sees a preview of ${path}.` }
  }).catch($ => ({ deny: `${$.plugin.name}: the preview failed.` }))

  on('command.run', { command: 'md-preview' }, async ($, e) => {
    const asked = argOf(e.args)
    const list = await read($, recent)
    const path = asked !== '' ? asked : list.length === 1 ? list[0] : undefined

    if (path === undefined && list.length === 0) {
      return {
        text: `No markdown file has been edited in this session yet. Name one to preview it: /${COMMAND} <path>`,
      }
    }

    if (path === undefined) {
      await pick($, list.length)

      return { text: `Choose one of the ${list.length} markdown files edited in this session.` }
    }

    const opened = await show($, path, true)

    if ('failed' in opened) {
      return { text: opened.failed }
    }

    return {
      text: opened.isPlaced
        ? `Previewing ${path}.`
        : `The preview of ${path} is not on screen: ${opened.reason}`,
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await update($, view, () => null)

    return closed
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const current = await read($, view)
    const list = await read($, recent)
    const cwd = await $.session.cwd()

    if (current?.kind !== 'file') {
      return (
        <Box flexDirection="column">
          <Text bold>Markdown files edited in this session</Text>
          {list.length === 0 && <Text dimColor>None yet.</Text>}
          {list.map((path, index) => (
            <Button
              key={`pick-${index}`}
              plain
              hotkey={String(index + 1)}
              label={labelOf(path, cwd)}
              autoFocus={index === 0 ? true : undefined}
              onPress={() => press($, path)}
            />
          ))}
          <Text dimColor>A number or Enter previews, Esc closes.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box columnGap={2} flexWrap="wrap">
          <Text bold>{labelOf(current.path, cwd)}</Text>
          {list.length > 1 && (
            <Button key="back" plain hotkey="b" label="Back" onPress={() => pick($, list.length)} />
          )}
          <Button key="reload" plain hotkey="r" label="Reload" onPress={() => reload($)} />
          <Button
            key="close"
            plain
            hotkey="q"
            label="Close"
            role="dismiss"
            onPress={() => $.ui.close({ id: PANE })}
          />
        </Box>
        {current.error !== null && (
          <Text color="error">Could not read the file: {current.error}</Text>
        )}
        {current.error === null && current.text.trim() === '' && (
          <Text dimColor>The file is empty.</Text>
        )}
        {current.error === null && current.text.trim() !== '' && (
          <Markdown text={current.text} />
        )}
      </Box>
    )
  })
}
