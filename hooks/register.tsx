import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'config-panel'
const SETTINGS_COMMAND = 'settings-panel'
const CONTEXT_COMMAND = 'context-panel'
// Rows the pane's frame, tab bar, header, footer and border take up.
const CHROME_ROWS = 9

// Bumped after each change so the drawing reads the new values.
const tick = atom({ plugin: 'config-panel', key: 'tick' } as const, 0)
const page = atom({ plugin: 'config-panel', key: 'page' } as const, 0)
const tab = atom({ plugin: 'config-panel', key: 'tab' } as const, 'settings')

const formatTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: SETTINGS_COMMAND,
      description: 'Show the Claude Code settings as toggles in a pane',
    })
    await $.command.register({
      name: CONTEXT_COMMAND,
      description: 'Show the context window usage, as /context does, in a pane',
    })

    return next(e)
  })

  on('command.run', { command: SETTINGS_COMMAND }, async $ => {
    await update($, tab, () => 'settings')
    await $.ui.open({ id: PANE, title: 'Settings' })

    return { text: 'Settings pane opened.' }
  })

  on('command.run', { command: CONTEXT_COMMAND }, async $ => {
    await update($, tab, () => 'context')
    await $.ui.open({ id: PANE, title: 'Settings' })

    return { text: 'Context pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const current = await read($, tab)

    const tabBar = (
      <Box justifyContent="space-between">
        <Button
          key="tab-settings"
          plain
          onPress={() => update($, tab, () => 'settings')}
        >
          <Text bold={current === 'settings'} color={current === 'settings' ? 'claude' : 'inactive'}>
            Settings
          </Text>
        </Button>
        <Button
          key="tab-context"
          plain
          onPress={() => update($, tab, () => 'context')}
        >
          <Text bold={current === 'context'} color={current === 'context' ? 'claude' : 'inactive'}>
            Context
          </Text>
        </Button>
      </Box>
    )

    if (current === 'context') {
      const usage = await $.session.usage({ breakdown: 'full' })
      const context = usage.context
      const breakdown = context.breakdown
      const used = breakdown?.totalTokens ?? context.tokens ?? 0
      const max = breakdown?.maxTokens ?? context.window
      const percent = Math.min(100, Math.round(breakdown?.percentage ?? context.percent ?? 0))
      const categories = breakdown?.categories ?? []

      return (
        <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
          {tabBar}

          <Box flexDirection="column" marginTop={1}>
            <Box justifyContent="space-between">
              <Text bold>{breakdown?.model ?? 'Context'}</Text>
              <Text dimColor>
                {formatTokens(used)} / {formatTokens(max)} ({percent}%)
              </Text>
            </Box>
            <Box marginTop={1} height={1}>
              <Box width={0} flexGrow={Math.max(percent, 0)} height={1} backgroundColor="success" />
              <Box width={0} flexGrow={Math.max(100 - percent, 0)} height={1} backgroundColor="inactive" />
            </Box>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            {categories.map(category => {
              const color =
                category.kind === 'used'
                  ? 'success'
                  : category.kind === 'buffer'
                    ? 'warning'
                    : category.kind === 'deferred'
                      ? 'suggestion'
                      : 'inactive'
              return (
                <Box key={category.name} justifyContent="space-between">
                  <Text color={color}>
                    {'● '}
                    {category.name}
                  </Text>
                  <Text dimColor>
                    {formatTokens(category.tokens)}
                    {category.isDeferred ? ' (deferred)' : ''}
                  </Text>
                </Box>
              )
            })}
            {categories.length === 0 && <Text dimColor>No breakdown available.</Text>}
          </Box>
        </Box>
      )
    }

    const current_page = await read($, page)
    const rows = await $.config.list()
    const pageSize = Math.max(5, (e.viewport?.rows ?? 24) - CHROME_ROWS)
    const pages = Math.max(1, Math.ceil(rows.length / pageSize))
    const index = Math.min(current_page, pages - 1)
    const slice = rows.slice(index * pageSize, (index + 1) * pageSize)

    const change = async (key: string, value: string | boolean) => {
      await $.config.set({ key, value })
      await update($, tick, n => n + 1)
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        {tabBar}

        <Box justifyContent="space-between" marginTop={1}>
          <Text bold color="claude">Claude Code settings</Text>
          <Text dimColor>
            {index + 1} / {pages}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {slice.map(row => {
            // Read-only: a locked row, or a value with no toggle or choice.
            if (row.isLocked || (typeof row.value !== 'boolean' && !row.options)) {
              return (
                <Box key={row.key} justifyContent="space-between">
                  <Text dimColor>
                    {'  '}
                    {row.label}
                  </Text>
                  <Text dimColor>{String(row.value)}</Text>
                </Box>
              )
            }

            if (typeof row.value === 'boolean') {
              return (
                <Button
                  key={row.key}
                  plain
                  onPress={() => change(row.key, !row.value)}
                >
                  <Text color={row.value ? 'success' : 'inactive'}>
                    {row.value ? '●' : '○'}
                  </Text>
                  <Text> {row.label}</Text>
                </Button>
              )
            }

            // Choice row: each press moves to the next option.
            const options = row.options ?? []
            const at = options.indexOf(String(row.value))
            const next = options[(at + 1) % options.length]
            return (
              <Button key={row.key} plain onPress={() => change(row.key, next)}>
                <Text color="suggestion">◆</Text>
                <Text> {row.label}</Text>
                <Text color="suggestion">  {String(row.value)}</Text>
              </Button>
            )
          })}
        </Box>

        <Box justifyContent="space-between" marginTop={1}>
          <Button
            key="prev"
            plain
            onPress={() => update($, page, p => Math.max(0, p - 1))}
          >
            <Text color="suggestion">‹ prev</Text>
          </Button>
          <Button
            key="next"
            plain
            onPress={() => update($, page, p => Math.min(pages - 1, p + 1))}
          >
            <Text color="suggestion">next ›</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
