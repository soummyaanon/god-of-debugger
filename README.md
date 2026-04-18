# god-of-debugger — marketplace

A Claude Code plugin marketplace hosting **`god-of-debugger`**: falsification-first, hypothesis-driven parallel debugging.

**Website:** [godofdebugger.bixai.dev](https://godofdebugger.bixai.dev/) · **Repo:** [github.com/soummyaanon/god-of-debugger](https://github.com/soummyaanon/god-of-debugger)

> Full plugin docs: **[`plugins/god-of-debugger/README.md`](plugins/god-of-debugger/README.md)**

---

## Install

```bash
claude plugin marketplace add soummyaanon/god-of-debugger
claude plugin install god-of-debugger@god-of-debugger-marketplace
```

Or inside a Claude Code session:

```
/plugin marketplace add soummyaanon/god-of-debugger
/plugin install god-of-debugger@god-of-debugger-marketplace
```

Then:

```
/god-of-debugger <paste your bug here>
```

---

## Repo layout

```
.
├── .claude-plugin/
│   └── marketplace.json          # marketplace catalog (what `marketplace add` reads)
└── plugins/
    └── god-of-debugger/          # the plugin itself
        ├── .claude-plugin/
        │   └── plugin.json       # plugin manifest
        ├── commands/             # /god-of-debugger slash command
        ├── skills/               # debug / repro / run / promote
        ├── agents/               # hypothesis-runner, adversary, bisect-runner
        ├── hooks/                # guard-ship-the-fix (PreToolUse)
        └── README.md             # full plugin documentation
```

The root holds the **marketplace**. The `plugins/god-of-debugger/` directory holds the **plugin**. They are separate things the docs keep conflating — this repo keeps them in their own folders.

---

## Versioning

Version is declared in `plugins/god-of-debugger/.claude-plugin/plugin.json` (the manifest wins per official docs). Bump it there, tag the commit, push.

## License

MIT. See [`LICENSE`](LICENSE).
