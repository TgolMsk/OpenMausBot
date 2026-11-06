# 自用客户端开发

本地目录：`/Users/ws/Project/BotIvn`。后续在 `codex/personal-client` 分支开发。

- `origin`：`https://github.com/TgolMsk/OpenMausBot.git`
- `upstream`：`https://github.com/milind-soni/OpenMausBot.git`
- 初始基线：`f6967835c`（fork 的 `main`，版本 `0.1.144`）

## 启动

需要 Node 24+ 和 pnpm 10.33.0。第一次安装依赖：

```sh
pnpm --dir /Users/ws/Project/BotIvn install --frozen-lockfile
```

一条命令启动后端、Vite 和 Electron：

```sh
pnpm --dir /Users/ws/Project/BotIvn dev:personal
```

启动器会等待后端和前端就绪，再打开桌面窗口。退出 Electron（macOS 按 ⌘Q）或在终端按 Ctrl-C，会结束本次启动的开发进程。端口占用时会报错，不会连接已有服务。

| 用途 | 地址或目录 |
| --- | --- |
| 前端与热更新 | `http://127.0.0.1:5199` |
| Harness API | `http://127.0.0.1:8799` |
| Webhook 接收器 | `http://127.0.0.1:8800` |
| 开发会话、配置和密钥 | `.omb-scratch/personal-client/data/` |
| Electron 配置与缓存 | `.omb-scratch/personal-client/desktop/` |

开发数据目录已被 Git 忽略，独立于 `~/.openmausbot` 和正式客户端的桌面配置。首次启动设置简体中文，后续保留已保存的设置；开发桌面的使用统计默认关闭。聊天可使用本机已有的 CLI 登录，启动检查不发送真实模型请求。

## 代码入口

| 模块 | 入口 |
| --- | --- |
| React 应用 | `src/App.tsx`、`src/components/` |
| 客户端状态与 API | `src/state/store.tsx` |
| 简体中文 | `src/locales/zh.json` |
| 品牌 | `src/lib/brand.ts` |
| HTTP / SSE 与任务管理 | `server/index.ts`、`server/harness/` |
| 模型与 CLI 驱动 | `server/drivers/`、`server/contracts.ts` |
| Electron 桌面壳 | `electron/main.mjs`、`electron/preload.cjs` |
| 自用开发启动器 | `scripts/dev-personal.mjs`、`electron/personal-dev.mjs` |

云电脑、第三方连接器与云语音按需配置。开发模式的 Full / Custom 审批模式需要打包版内嵌后端，原版已有这一限制。

## 验证

```sh
pnpm --dir /Users/ws/Project/BotIvn build
pnpm --dir /Users/ws/Project/BotIvn check:electron
```

服务端或会话变更先读 [验证约定](verification/README.md)，用隔离 fixture 验证，不对日常使用数据执行测试操作：

```sh
cd /Users/ws/Project/BotIvn && node --experimental-strip-types scripts/control-omb.ts launch
```

核心代码遵循 Apache-2.0；`enterprise/` 使用其单独许可证，定制时保留原有许可证与归属声明。
