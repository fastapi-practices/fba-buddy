# FbaBuddy

基于 Electron、React 和 TypeScript 的桌面 AI 工作台，支持 Chat、Work、Coding 三种会话模式。渲染层使用 Vite，包管理器为 pnpm。

## 开发

```bash
pnpm install
pnpm dev
```

需要 Node.js 22+、pnpm 11+，以及配套的 `ai_buddy` 后端。`pnpm dev` 只启动桌面窗口，不自动打开浏览器。

## 检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:smoke
```

`pnpm test:smoke` 只验证桌面进程启动、主窗口创建和渲染根节点挂载，不覆盖业务流程。

## 打包

构建当前平台安装包：

```bash
pnpm dist
```

产物写入 `release/`，默认只构建当前平台和架构。

指定平台打包：

```bash
node scripts/pack.mjs --mac --x64 --arm64 --publish never
node scripts/pack.mjs --win --x64 --publish never
node scripts/pack.mjs --linux --x64 --publish never
```

构建使用 ad-hoc 签名或未签名发布，未配置 Apple 公证和 Windows 代码签名。首次安装时，macOS 需在「隐私与安全性」中允许打开，Windows SmartScreen 需选择「仍要运行」。

## 发布

先确保 `package.json` 的 `version` 与标签一致，再推送 tag：

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

`v*` tag 会触发三端打包；全部成功后创建 GitHub Release，并上传安装包及 `latest*.yml` 更新清单。普通 push 和 PR 只运行 CI，不构建安装包。

## 目录

```text
electron/   主进程、预加载脚本与原生模块
src/        渲染层
scripts/    开发、构建与打包脚本
.github/    CI 与发布工作流
```
