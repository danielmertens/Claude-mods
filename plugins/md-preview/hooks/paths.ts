export const MAX_RECENT = 5

const BACKSLASH = String.fromCharCode(92)
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)
const MARKDOWN = /[.](md|markdown)$/i
const DRIVE = /^[a-z]:[/]/i
const TRAILING_SLASHES = /[/]+$/
const FRONT_MATTER = /^---\n([^]*?)\n---[ \t]*(\n|$)/

const slashed = (path: string) => path.replaceAll(BACKSLASH, '/')

// Windows paths differ in case and separators without naming another file.
const keyOf = (path: string) => {
  const flat = slashed(path)

  return DRIVE.test(flat) ? flat.toLowerCase() : flat
}

export const isMarkdown = (path: string) => MARKDOWN.test(path)

export const isSameFile = (a: string, b: string) => keyOf(a) === keyOf(b)

export const absolute = (path: string, cwd: string) => {
  const flat = slashed(path)
  const isAbsolute = flat.startsWith('/') || DRIVE.test(flat)

  return isAbsolute ? path : `${slashed(cwd).replace(TRAILING_SLASHES, '')}/${flat}`
}

export const remember = (list: readonly string[], path: string) =>
  [path, ...list.filter(one => !isSameFile(one, path))].slice(0, MAX_RECENT)

export const nameOf = (path: string) => slashed(path).split('/').pop() || path

export const labelOf = (path: string, cwd: string) => {
  const root = `${keyOf(cwd).replace(TRAILING_SLASHES, '')}/`

  return keyOf(path).startsWith(root) ? slashed(path).slice(root.length) : path
}

// What a person types after the command: a path, maybe quoted or @-mentioned.
export const argOf = (args: string) => {
  const path = args.trim().replace(/^@/, '')
  const quote = path[0]
  const isQuoted =
    path.length > 1 && (quote === '"' || quote === "'") && path.endsWith(quote)

  return isQuoted ? path.slice(1, -1) : path
}

// Tab (9) and newline (10) are the only control characters Markdown takes.
const isDrawable = (character: string) => {
  const code = character.charCodeAt(0)

  return code === 9 || code === 10 || (code > 31 && code !== 127)
}

// Front matter reads as a heading unless it is fenced.
export const clean = (raw: string) => {
  const unmarked = raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(1) : raw
  const text = Array.from(unmarked.replace(/\r\n?/g, '\n'))
    .filter(isDrawable)
    .join('')
  const front = FRONT_MATTER.exec(text)

  return front === null
    ? text
    : `\`\`\`yaml\n${front[1]}\n\`\`\`\n${text.slice(front[0].length)}`
}
