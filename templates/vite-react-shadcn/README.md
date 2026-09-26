# proto-kit B 轨模板（vite-react-shadcn）

proto-kit 双轨发射的 B 轨工程模板：React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3.4 + 自研 shadcn 风格组件（无 radix）。MSW@2 提供 mock 数据层。

本目录是 **scaffold_react.mjs 的拷贝源**，不是直接开发的工程。脚手架会：

- 拷贝整个目录到目标 outDir
- 覆写 `src/tokens.css`（IR designTokens → CSS 变量 `--<group>-<name>`）
- 覆写 `src/App.tsx` / `src/main.tsx`（HashRouter，路由 `/<pageId>`，入口重定向到 flowGraph isEntry 页）
- 生成 `src/routes/<pageId>/index.tsx` 页面 stub（含 PAGEGEN-TODO）
- 生成 `src/shell/NavBar.tsx` / `ShellLayout.tsx`（usesShell=default 的页共用顶栏，退出按钮 id=logout-btn）
- 覆写 `src/mocks/handlers.ts` / `src/mocks/browser.ts` / `src/lib/fixtures.json`（dataContract + fixtures → MSW GET /api/<entity 复数小写>）

版本策略：全部依赖锁死次版本（`~`），保证脚手架产物可复现构建。

依赖均未安装时先 `npm install`；开发 `npm run dev`；构建 `npm run build`（tsc --noEmit + vite build）。
