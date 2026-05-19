# OpenClaw Integration

How TokenTracker collects token usage from OpenClaw, and what to check when it isn't working.

## TL;DR

You do **not** need to download, copy, or drag any plugin into OpenClaw. Running `tokentracker` (or `tokentracker init`) once handles the whole installation.

## How it works

TokenTracker ships a small OpenClaw session plugin (`openclaw-session-sync`) inside the `tokentracker-cli` npm package. It lives at:

```
~/.tokentracker/app/openclaw-plugin/openclaw-session-sync/
├── package.json
├── openclaw.plugin.json
└── index.js
```

During `tokentracker init`, TokenTracker:

1. Writes the plugin files to the path above.
2. Calls OpenClaw's own CLI: `openclaw plugins install --link <that path>`.
3. Calls `openclaw plugins enable openclaw-session-sync`.
4. The plugin registers a session listener inside OpenClaw. After you restart the OpenClaw gateway, every completed session gets a token-usage record that TokenTracker reads during `sync`.

The plugin only emits token counts and timestamps. It never reads or transmits prompt or response content.

### Windows + WSL

If OpenClaw runs inside WSL but TokenTracker runs on Windows, TokenTracker also scans OpenClaw session logs through `\\wsl$` / `\\wsl.localhost`:

```
\\wsl$\<distro>\home\<user>\.openclaw\agents\*\sessions\*.jsonl
```

This passive scan can monitor token usage from the Windows app/CLI even when the OpenClaw plugin is installed inside WSL instead of Windows. Set `TOKENTRACKER_WSL_DISTROS=Ubuntu` to restrict discovery to one distro, or `TOKENTRACKER_OPENCLAW_HOME` to point at a specific `.openclaw` directory.

## Verifying the install

Run:

```bash
tokentracker status
```

Look for the `OpenClaw Session Plugin` row. Expected states:

| Status | Meaning |
|---|---|
| `installed` | Plugin is linked and enabled. Restart the OpenClaw gateway once so it loads. |
| `set` | Plugin is already active in the running OpenClaw process. |
| `skipped` | Something prevented the install. See the `detail` column. |

## Troubleshooting

If `tokentracker status` shows `skipped`, the `detail` column tells you which case applies:

### `OpenClaw CLI not found`

The `openclaw` binary is not on your `PATH`. TokenTracker cannot link a plugin without it.

**Fix:** install OpenClaw globally, confirm `openclaw --version` works in a fresh terminal, then re-run `tokentracker init`.

### `OpenClaw config unreadable` / `OpenClaw config not found`

TokenTracker could not read `~/.openclaw/openclaw.json`. This usually means OpenClaw has never been launched on this machine, or the config path is in a non-default location.

**Fix:**
- Launch OpenClaw once so it generates its config.
- If you use a custom location, set `OPENCLAW_CONFIG_PATH` to the absolute path before running `tokentracker init`.

### `Install failed: …`

OpenClaw's own CLI rejected the `plugins install --link` command. The `detail` includes the stderr from OpenClaw.

**Fix:** try the command manually to reproduce it:

```bash
openclaw plugins install --link ~/.tokentracker/app/openclaw-plugin/openclaw-session-sync
openclaw plugins enable openclaw-session-sync
```

If that surfaces a clearer error (e.g. version mismatch, locked config file), resolve it there, then re-run `tokentracker init`.

## Removing the plugin

```bash
openclaw plugins disable openclaw-session-sync
openclaw plugins uninstall openclaw-session-sync
```

Or run `tokentracker uninstall` to remove hooks and plugins for every integration at once.

## Where to look in the source

- `src/lib/openclaw-session-plugin.js` — installer, probe, plugin-file builders.
- `src/commands/init.js` — calls `installOpenclawSessionPlugin` and reports its result.
- `src/lib/rollout.js` — parses OpenClaw session records during `tokentracker sync`.
