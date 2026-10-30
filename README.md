# config-panel

A Claude Code plugin that shows the `/config` settings in a pane, with a
toggle for each on/off setting and a press-to-cycle control for each setting
that takes a choice.

## Install

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install config-panel@config-panel
```

## Use

Run `/settings-panel` to open the pane.

- `●` / `○`: an on/off setting. A press flips it.
- `◆`: a setting with several values. A press moves to the next one.
- Grey rows are read-only: locked by an administrator, or with a value that
  has no toggle or choice.
- `‹ prev` / `next ›` page through the list. The page size follows the
  height of the pane.

Changes go through the same path as `/config`, so they show up there too.

## How it works

The pane lists the rows from `$.config.list()` and writes a change with
`$.config.set()`. Nothing is stored outside Claude Code's own settings.

## License

MIT. See [LICENSE](LICENSE).
