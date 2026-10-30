import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'config-panel'
const COMMAND = 'settings-panel'
// Rows the pane's frame, header, footer and border take up.
const CHROME_ROWS = 7

// Bumped after each change so the drawing reads the new values.
const tick = atom({ plugin: 'config-panel', key: 'tick' } as const, 0)
const page = atom({ plugin: 'config-panel', key: 'page' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show the Claude Code settings as toggles in a pane',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Settings' })

    return { text: 'Settings pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const current = await read($, page)
    const rows = await $.config.list()
    const pageSize = Math.max(5, (e.viewport?.rows ?? 24) - CHROME_ROWS)
    const pages = Math.max(1, Math.ceil(rows.length / pageSize))
    const index = Math.min(current, pages - 1)
    const slice = rows.slice(index * pageSize, (index + 1) * pageSize)

    const change = async (key: string, value: string | boolean) => {
      await $.config.set({ key, value })
      await update($, tick, n => n + 1)
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        <Box justifyContent="space-between">
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
