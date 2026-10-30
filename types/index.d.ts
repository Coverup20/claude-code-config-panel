declare module 'claude-code' {
  interface PluginState {
    'config-panel': { tick: number; page: number; tab: 'settings' | 'context' }
  }
}
