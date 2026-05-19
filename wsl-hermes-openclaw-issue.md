# 支持 Windows 原生环境监控 WSL 内的 Hermes Agent / OpenClaw token 使用

## What problem does this solve?

当前 TokenTracker 在 Windows 原生环境运行时，默认只会读取 Windows 用户目录下的本机配置和数据，例如：

```text
C:\Users\<user>\.hermes\state.db
C:\Users\<user>\.openclaw\...
```

但很多 Windows 用户会把 Hermes Agent / OpenClaw 安装并运行在 WSL 里。此时真实数据路径通常在：

```text
/home/<wsl-user>/.hermes/state.db
/home/<wsl-user>/.openclaw/agents/*/sessions/*.jsonl
```

Windows 侧对应为：

```text
\\wsl$\<distro>\home\<wsl-user>\.hermes\state.db
\\wsl$\<distro>\home\<wsl-user>\.openclaw\agents\*\sessions\*.jsonl
```

因此当 TokenTracker 作为 Windows CLI 或 Windows/macOS 风格的本地 dashboard 服务运行时，无法自动发现 WSL 中的 Hermes/OpenClaw 使用记录，导致 dashboard 里缺少这两个工具的 token 统计。

实际排查中还遇到一个细节：某些 Windows 环境下，直接枚举 `\\wsl$` 或 `\\wsl.localhost` 根目录可能失败，但访问具体 distro 路径（例如 `\\wsl.localhost\Ubuntu\home\<user>`）是正常的。这会导致仅靠 UNC 根目录枚举不够可靠。

另外 Hermes 的 `state.db` 在 agent 正在运行时可能处于 SQLite locked 状态，直接读取会报：

```text
database is locked (5)
```

这会让路径发现成功后仍然无法采集 token。

## Proposed solution

希望 TokenTracker 在 Windows 原生运行时增加 WSL passive reader 支持：

1. 当 `process.platform === "win32"` 且当前进程不在 WSL 内运行时，自动探测 WSL 发行版。
2. 支持通过 `wsl.exe -l -q` 获取 distro 名称，避免只依赖 `\\wsl$` 根目录枚举。
3. 对每个 distro 扫描：

```text
\\wsl$\<distro>\home\*\.hermes\state.db
\\wsl.localhost\<distro>\home\*\.hermes\state.db
\\wsl$\<distro>\home\*\.openclaw\agents\*\sessions\*.jsonl
\\wsl.localhost\<distro>\home\*\.openclaw\agents\*\sessions\*.jsonl
```

4. 为高级用户提供环境变量覆盖/限制，例如：

```text
TOKENTRACKER_WSL_DISTROS=Ubuntu
TOKENTRACKER_WSL_ROOTS=\\wsl$\Ubuntu
TOKENTRACKER_HERMES_DB_PATH=...
TOKENTRACKER_HERMES_HOME=...
TOKENTRACKER_OPENCLAW_HOME=...
```

5. Hermes SQLite 读取时，如果直接读取 `state.db` 遇到锁，可以复制 `state.db`、`state.db-wal`、`state.db-shm` 到临时目录后从快照读取，避免干扰正在运行的 Hermes。
6. `tokentracker status` 中展示发现结果，例如：

```text
- Hermes Agent: passive reader (\\wsl$\Ubuntu\home\<user>\.hermes\state.db)
- OpenClaw passive reader: N session jsonl files found
```

这样用户可以确认 Windows 侧是否已经发现 WSL 内的数据源。

## Alternatives considered

一种替代方案是要求用户在 WSL 内单独安装并运行 TokenTracker。这样路径、Node、OpenClaw CLI、Hermes DB 都在同一个 Linux 环境中，技术上最直接。

但这个方案对 Windows dashboard / menu bar / 原生 CLI 用户不够友好。用户可能已经在 Windows 侧启动 TokenTracker dashboard，却无法看到 WSL 内实际使用的 Hermes/OpenClaw token。

另一种方案是只提供手动配置路径，例如让用户设置 `TOKENTRACKER_HERMES_DB_PATH` 或 `TOKENTRACKER_OPENCLAW_HOME`。这能解决部分问题，但发现成本较高，而且不处理 `\\wsl$` 根目录枚举失败、SQLite locked 等常见问题。

## Anything else

这个功能应保持 passive reader 语义：只读取 token 数、模型、时间戳等统计信息，不读取 prompt/response 内容。

OpenClaw 的插件安装仍建议优先在 OpenClaw 所在环境中完成。如果 OpenClaw 跑在 WSL，插件和 OpenClaw CLI 仍然更适合在 WSL 内管理；Windows 侧主要负责 passive scan 已生成的 session JSONL。

Hermes 方面需要特别注意 WAL 模式下的 SQLite 读取。只复制 `state.db` 可能读不到最新数据或遇到锁，最好连同 `state.db-wal` 和 `state.db-shm` 一起快照读取。
