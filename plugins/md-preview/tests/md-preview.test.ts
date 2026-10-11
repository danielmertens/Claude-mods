import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const CWD = '/work'
const TOOL = 'mcp__md-preview__show'
const PANE = {
  plugin: 'md-preview',
  component: 'Pane',
  requestId: 'md-preview',
  props: {
    title: 'Preview',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// The engine hands `fs.read` the path as this machine spells it: on Windows,
// `Z:` and backslashes around the `/work/...` the test wrote.
const posix = (path: string) =>
  path.replaceAll(String.fromCharCode(92), '/').replace(/^[A-Za-z]:/, '')

// What stands beneath the mod: files in memory and a surface that seats
// every pane, unless `isSeating` is turned off.
const world = (on: On, files: Record<string, string> = {}) => {
  const seen = { opened: [] as string[], toasts: [] as string[], isSeating: true }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__md-preview__${e.name}` } }))
  on('fs.read', ($, e) => {
    const text = files[posix(e.path)]

    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.title ?? e.id)

    return {
      value: seen.isSeating
        ? { isPlaced: true }
        : { isPlaced: false, reason: 'the terminal is 100 columns wide' },
    }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', { tool: 'Write' }, ($, e) => {
    if (e.file_path.includes('locked')) {
      return { isError: true, result: 'The file is locked.' }
    }

    files[e.file_path] = e.content

    return { result: undefined as never }
  })

  return seen
}

const start = ($: Engine) =>
  $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

const write = ($: Engine, file_path: string, content: string) =>
  $.tool.call({ tool: 'Write', file_path, content })

const run = ($: Engine, args = '') =>
  $.command.run({
    command: 'md-preview',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })

test('the command says so while no markdown file was edited', async ($, on) => {
  const seen = world(on)
  await start($)
  await write($, '/work/main.ts', 'export {}')

  expect((await run($)).text).toContain('No markdown file')
  expect(seen.opened).toEqual([])
})

test('one edited file is previewed at once, on every surface', async ($, on) => {
  const seen = world(on)
  await start($)
  await write($, '/work/docs/notes.md', '# Notes\r\n\r\nFirst draft.')

  expect((await run($)).text).toContain('Previewing')
  expect(seen.opened).toEqual(['Preview: notes.md'])

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Notes\n\nFirst draft.')
    expect(await ui.find({ type: 'Text', text: 'docs/notes.md' })).toBeDefined()
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    await ui.unmount()
  }
})

test('several edited files are listed newest first, and a press previews one', async ($, on) => {
  const seen = world(on)
  await start($)
  await write($, '/work/a.md', 'Alpha')
  await write($, '/work/b.md', 'Beta')
  await write($, '/work/a.md', 'Alpha again')
  await run($)

  expect(seen.opened).toEqual(['Markdown preview'])

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Button' })

  expect(rows.map(row => row.props.label)).toEqual(['a.md', 'b.md'])
  expect(rows.map(row => row.props.hotkey)).toEqual(['1', '2'])

  await ui.press({ key: 'pick-1' })

  expect(seen.opened).toEqual(['Markdown preview', 'Preview: b.md'])
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('Beta')

  await ui.press({ key: 'back' })

  expect(await ui.findAll({ key: 'pick-0' })).toHaveLength(1)
  await ui.unmount()
})

test('the list holds the last five, and no edit that failed', async ($, on) => {
  world(on)
  await start($)

  for (const name of ['1', '2', '3', '4', '5', '6', 'locked']) {
    await write($, `/work/${name}.md`, name)
  }

  await run($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Button' })

  expect(rows.map(row => row.props.label)).toEqual(['6.md', '5.md', '4.md', '3.md', '2.md'])
  await ui.unmount()
})

test('an open preview follows the file as it is edited again', async ($, on) => {
  world(on)
  await start($)
  await write($, '/work/plan.md', 'One')
  await run($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('One')

  await write($, '/work/plan.md', '---\ntitle: Plan\n---\nTwo')

  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('```yaml\ntitle: Plan\n```\nTwo')
  await ui.unmount()
})

test('the command previews a path the person names', async ($, on) => {
  const seen = world(on, { '/work/README.md': 'Read me' })
  await start($)

  expect((await run($, '"README.md"')).text).toContain('Previewing')
  expect((await run($, 'missing.md')).text).toContain('Could not read missing.md')
  expect(seen.opened).toEqual(['Preview: README.md'])
})

test('the tool shows the file the model names', async ($, on) => {
  const seen = world(on, { '/work/docs/guide.md': '# Guide' })
  await start($)
  const shown = await $.tool.call({ tool: TOOL, file_path: 'docs/guide.md' })

  expect(shown.result).toBe('The user now sees a preview of docs/guide.md.')
  expect(seen.opened).toEqual(['Preview: guide.md'])

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('# Guide')
  await ui.unmount()

  // Shown by the model, not edited: the command's list stays empty.
  expect((await run($)).text).toContain('No markdown file')
})

test('the tool refuses what it cannot show', async ($, on) => {
  const seen = world(on, { '/work/main.ts': 'export {}' })
  await start($)

  expect(JSON.stringify(await $.tool.call({ tool: TOOL, file_path: 'main.ts' }))).toContain(
    'must name a markdown file',
  )
  expect(JSON.stringify(await $.tool.call({ tool: TOOL, file_path: 'gone.md' }))).toContain(
    'Could not read gone.md',
  )
  expect(seen.opened).toEqual([])
})

test('the tool says so when the pane is not on screen', async ($, on) => {
  const seen = world(on, { '/work/guide.md': '# Guide' })
  seen.isSeating = false
  await start($)
  const shown = await $.tool.call({ tool: TOOL, file_path: '/work/guide.md' })

  expect(shown.result).toContain('not on screen')
  expect(seen.toasts).toEqual(['A preview of guide.md is ready: /md-preview /work/guide.md'])
})
