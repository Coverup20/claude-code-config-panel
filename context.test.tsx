import { expect, test } from 'claude-code/testing'

const CONTEXT_PANE = {
  plugin: 'config-panel',
  component: 'Pane',
  requestId: 'config-context',
  props: {
    title: 'Context',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = {
  startedAt: 0,
  rateLimits: [
    { kind: 'five_hour', percentUsed: 12, resetsAt: '2030-01-01T10:00:00Z' },
  ],
  cost: { usd: 58.99 },
  context: {
    window: 1000000,
    tokens: 339000,
    percent: 34,
    breakdown: {
      model: 'fast-1m',
      totalTokens: 339000,
      maxTokens: 1000000,
      rawMaxTokens: 1000000,
      percentage: 34,
      autocompactSource: 'model-default',
      gridRows: [
        [
          {
            color: 'success',
            isFilled: true,
            categoryName: 'Messages',
            tokens: 1,
            percentage: 0.1,
            squareFullness: 1,
          },
        ],
      ],
      categories: [
        { name: 'System prompt', tokens: 1700, color: 'inactive', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 325000, color: 'claude', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 661000, color: 'inactive', isDeferred: false, kind: 'free' },
      ],
    },
  },
}

test('the context pane shows the model, the categories, the limit and the cost', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('command.register', () => ({ value: { command: 'context-panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ui = await $.ui.mount({ ...CONTEXT_PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /fast-1m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Free space/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5-hour session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /58\.99/ })).toBeDefined()
  await ui.unmount()
})

test('the context frame is as tall as the pane and the chart fills what is left', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ui = await $.ui.mount({ ...CONTEXT_PANE, surface: 'terminal' })

  // The frame takes the pane's rows, not the height of its content.
  const frame = await ui.find({ type: 'Box', props: { borderStyle: 'round' } })
  expect(frame?.props?.height).toBe(40)

  // The filler chart is the one Box given an explicit height below the frame.
  const chart = await ui.find({ type: 'Box', props: { flexDirection: 'column', marginTop: 1 } })
  expect(chart).toBeDefined()
  await ui.unmount()
})

test('the chart draws a percentage axis and bars wider than one column', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Four readings stored by an earlier turn.
  on('state.get', (_, e) =>
    e.key === 'samples' ? { value: { value: [10, 40, 80, 34], version: 1 } } : { value: undefined },
  )

  const ui = await $.ui.mount({ ...CONTEXT_PANE, surface: 'terminal' })

  // The axis zooms on the readings (10..80), so it never reads 100%.
  expect(await ui.find({ type: 'Text', text: /85%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /100%/ })).toBe(undefined)

  // A bar is drawn as a shaded texture, several columns wide.
  const bars = await ui.findAll({ type: 'Text', text: /[▒▓]/ })
  expect(bars.length > 0).toBe(true)
  expect((bars[0]?.text?.match(/[▒▓]/g)?.length ?? 0) > 4).toBe(true)

  // The 80 reading is drawn red, the 10 one green.
  const colors = bars.map(bar => bar.props?.color)
  expect(colors.includes('error')).toBe(true)
  expect(colors.includes('success')).toBe(true)
  await ui.unmount()
})

test('bars stay apart even when the readings outnumber the columns', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // More readings than the plot has columns: they must be dropped, not squeezed.
  on('state.get', (_, e) =>
    e.key === 'samples'
      ? { value: { value: Array.from({ length: 200 }, (_, i) => 20 + (i % 40)), version: 1 } }
      : { value: undefined },
  )

  const ui = await $.ui.mount({ ...CONTEXT_PANE, surface: 'terminal' })

  // A filled bar is always followed by its blank column.
  const blanks = await ui.findAll({ type: 'Text', text: /^ $/ })
  expect(blanks.length > 0).toBe(true)
  await ui.unmount()
})

test('the settings pane draws a toggle for an on/off row', async ($, on) => {
  on('config.list', () => ({
    value: [
      { key: 'verbose', label: 'Verbose output', kind: 'toggle', value: false, provider: { kind: 'engine' }, isLocked: false },
    ],
  }))
  on('command.register', () => ({ value: { command: 'settings-panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ui = await $.ui.mount({
    ...CONTEXT_PANE,
    requestId: 'config-panel',
    props: { ...CONTEXT_PANE.props, title: 'Settings' },
    surface: 'terminal',
  })

  expect(await ui.find({ type: 'Text', text: /Verbose output/ })).toBeDefined()
  await ui.unmount()
})
