import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'config-panel'
const CONTEXT_PANE = 'config-context'
const SETTINGS_COMMAND = 'settings-panel'
const CONTEXT_COMMAND = 'context-panel'
// Rows the pane's frame, header, footer and border take up.
const CHROME_ROWS = 7

// Bumped after each change so the drawing reads the new values.
const tick = atom({ plugin: 'config-panel', key: 'tick' } as const, 0)
const page = atom({ plugin: 'config-panel', key: 'page' } as const, 0)

const formatTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)

const LIMIT_LABELS: Record<string, string> = {
  five_hour: '5-hour session',
  seven_day: 'Weekly (all models)',
  seven_day_opus: 'Weekly (Opus)',
  seven_day_sonnet: 'Weekly (Sonnet)',
}

// "resets in 3h 20m · Fri 14:00", from the reset instant the engine gives.
const formatReset = (resetsAt: string | undefined) => {
  if (!resetsAt) return 'reset time unknown'
  const at = new Date(resetsAt)
  if (Number.isNaN(at.getTime())) return 'reset time unknown'
  const minutes = Math.max(0, Math.round((at.getTime() - Date.now()) / 60000))
  const hours = Math.floor(minutes / 60)
  const left = hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes % 60}m`
  const when = at.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `resets in ${left} · ${when}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: SETTINGS_COMMAND,
      description: 'Show the Claude Code settings as toggles in a pane',
    })
    await $.command.register({
      name: CONTEXT_COMMAND,
      description: 'Show the context window usage and limits in a pane',
    })

    return next(e)
  })

  on('command.run', { command: SETTINGS_COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Settings' })

    return { text: 'Settings pane opened.' }
  })

  on('command.run', { command: CONTEXT_COMMAND }, async $ => {
    await $.ui.open({ id: CONTEXT_PANE, title: 'Context' })

    return { text: 'Context pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: CONTEXT_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const usage = await $.session.usage({ breakdown: 'full' })
    const context = usage.context
    const breakdown = context.breakdown
    const used = breakdown?.totalTokens ?? context.tokens ?? 0
    const max = breakdown?.maxTokens ?? context.window
    const percent = Math.min(100, Math.round(breakdown?.percentage ?? context.percent ?? 0))
    const categories = breakdown?.categories ?? []
    const gridRows = breakdown?.gridRows ?? []
    const limits = usage.rateLimits ?? []

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color="claude">Context Usage</Text>
          <Text dimColor>{breakdown?.model ?? ''}</Text>
        </Box>

        <Box flexDirection="row" marginTop={1}>
          <Box flexDirection="column" flexShrink={0}>
            {gridRows.map((row, r) => (
              <Box key={`row-${r}`}>
                {row.map((square, c) => (
                  <Text key={`sq-${r}-${c}`} color={square.color}>
                    {square.isFilled ? '⛁ ' : '⛶ '}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            <Text>
              {formatTokens(used)} / {formatTokens(max)} tokens
            </Text>
            <Text dimColor>{percent}% used</Text>
            <Box marginTop={1}>
              <Text dimColor>Estimated usage by category</Text>
            </Box>
            {categories.map(category => (
              <Box key={category.name}>
                <Text color={category.color}>{'⛁ '}</Text>
                <Text>
                  {category.name}: {formatTokens(category.tokens)}
                </Text>
              </Box>
            ))}
            {categories.length === 0 && <Text dimColor>No breakdown available.</Text>}
          </Box>
        </Box>

        {limits.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Limits</Text>
            {limits.map(limit => {
              const pct = Math.min(100, Math.round(limit.percentUsed))
              return (
                <Box key={limit.kind} flexDirection="column" marginTop={1}>
                  <Box justifyContent="space-between">
                    <Text>{LIMIT_LABELS[limit.kind] ?? limit.kind}</Text>
                    <Text dimColor>{pct}% used</Text>
                  </Box>
                  <Box height={1}>
                    <Box width={0} flexGrow={Math.max(pct, 0)} height={1} backgroundColor="success" />
                    <Box width={0} flexGrow={Math.max(100 - pct, 0)} height={1} backgroundColor="inactive" />
                  </Box>
                  <Text dimColor>{formatReset(limit.resetsAt)}</Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
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
