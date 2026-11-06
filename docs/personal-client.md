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

可按需配置自己的 VPS、Local VM、第三方连接器和语音 API。开发模式的 Full / Custom 审批模式需要打包版内嵌后端，原版已有这一限制。

## 商业服务清理范围

- 移除原作者的 Cloud 账户、套餐购买、订阅、升级和试用入口，以及 Boat、赞助和产品推广提示。
- 停用官方托管的连接器、手机中转、套餐赠送的模型/语音/研究额度和页面发布。
- 停用原作者桌面更新、服务器更新检查及会安装回原版的 Fleet 升级命令；自用桌面仅从本 fork 更新。
- 官方问题上报和使用统计不再自动连接；可明确配置自己的问题上报地址。
- 保留本地 CLI、模型使用量、自配模型/语音 API、MCP、自己的服务器和本地数据备份。

自用策略固定在 `shared/personal-client.ts` 和 `electron/personal-client.mjs`，用户界面不提供切回商业版的开关。历史协议和底层模块仍保留，便于合并上游修复；运行入口和后台连接已按自用策略关闭。

## 安装包与自动更新

自用发行仓库为 [TgolMsk/OpenMausBot Releases](https://github.com/TgolMsk/OpenMausBot/releases)，目前构建 macOS Apple silicon 和 Windows x64。

安装包启动 15 秒后检查更新，之后每小时检查一次；发现本仓库正式新版本后自动下载，并沿用原有闲时安装机制。设置里也可手动检查。开发模式不执行自动更新，草稿和预发布版本不会推给客户端，也不允许降级。

改好版本号、提交并推送本分支后，在这台 Mac 上发版：

```sh
pnpm --dir /Users/ws/Project/BotIvn release:personal
```

命令会启动并等待 GitHub 云构建，下载完整草稿，用本机钥匙串里的 Developer ID 证书签名 Mac 应用，通过 `fgbrowser-notary` 配置公证，重新生成更新索引与 blockmap，最后发布正式 Release。证书和公证凭据不上传 GitHub。Windows 安装包目前未做代码签名。

本 fork 继承的旧版跨仓镜像发布工作流已停用，发版不会向原作者仓库同步文件。

如云构建已完成，可继续签名并发布现有草稿：

```sh
pnpm --dir /Users/ws/Project/BotIvn release:personal:finish
```

发布流程拒绝覆盖已发布版本，拒绝混合不同提交的安装包，并校验 Mac 签名、公证、更新源及两端文件校验值。

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
