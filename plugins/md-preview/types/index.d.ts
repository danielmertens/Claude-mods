export type FileView = {
  kind: 'file'
  path: string
  text: string
  error: string | null
}

export type View = { kind: 'list' } | FileView

declare module 'claude-code' {
  interface PluginState {
    'md-preview': { recent: string[]; view: View | null }
  }
}
