# 发射规范 — 双轨规则、ID/属性生成规则、submit 合并契约、runtime 7 原语

发射 = 把 PrototypeIR 变成可运行产物。两轨共享同一套 **ID/属性生成规则**——它是 emit 与 gates 一致性的根基：A 轨发射器按它生成 DOM，gates 按它反查断言，B 轨 pagegen 必须落同样的锚点。

## 1. 双轨决策（interactiveComplexity）

| 页复杂度 | A 轨（单文件 HTML） | B 轨（React 工程） |
|---|---|---|
| static | 可只发 A 轨 | 可选 |
| basic | 发 | 发 |
| rich | **不发** | 只发 B 轨 |

v0.1 所有页默认 `interactiveComplexity=basic`（两轨都发）；rich 判定权在 planner，且必须有 registry 里 rich 级组件支撑。

## 2. A 轨产物形态

`emit_html.mjs` 产出**单文件** HTML：tokens → 内嵌 `<style>` 的 CSS 变量（`--<group>-<name>`）+ pk-* 基础样式 + 每页 `<section>` + 内嵌 runtime + `<body data-proto-entry="<entryPageId>">` + fixtures 以 `<script id="pk-fixtures" type="application/json">` 内联（list 行在发射期渲染，不依赖运行时取数）。`style` 的 `token:g.n` → CSS 变量引用；`ref` → class `pk-<ref小写>`；图片无 src → `https://picsum.photos/seed/<节点id>/400/240`。

## 3. ID / 属性生成规则表（mission 契约抄录，两轨通用）

| IR 概念 | 生成的 DOM 约定 |
|---|---|
| 页 | `<section class="pk-page" id="page-<pageId>" data-proto-page="<pageId>">`；hash 路由 `#<pageId>` |
| Tabs 容器 | 容器 id = 节点 id |
| tab 面板 | `<div id="<panelNodeId>" data-proto-panel="<tab名>" class="pk-panel">` |
| tab 按钮（自动生成） | `<button id="tab-<tab名>" data-proto-tab="<tab名>">label</button>` |
| tab 激活态 | 面板加 `.pk-active`、按钮 `aria-selected="true"`；默认第一个 tab 激活 |
| Dialog | 遮罩层 `<div id="<节点id>" class="pk-modal">`（默认隐藏）；自动生成关闭钮 `<button id="<节点id>-close">`；打开 = 加 `.pk-open` |
| List 行 | `<div id="<listId>-row-<n>">`，n 从 1 起；行内容按 fixtures 中 binding 实体字段渲染（金额前加 ¥；无 fixtures 时 3 行占位）；`props.filter` 形如 `status=paid` 按字段过滤，`=all` 或缺省不过滤 |
| 交互挂载 | 统一挂 `data-proto-chain='[{...},{...}]'`（JSON 数组，按 IR interactions 顺序）；元素 id = trigger 的 @ 后缀 |
| 状态条件显隐 | 元素可带 `data-proto-if="key=value"`（runtime 初始化与状态变更时求值） |
| set-state | `key=value` 扁平 kv，存 sessionStorage 的 `proto-state` JSON |

**B 轨对应义务**：pagegen 写 `src/routes/<pageId>/index.tsx` 时必须保留同一套锚点——元素 id、`tab-<名>` 按钮（含 `data-proto-tab`）、面板 `data-proto-panel` 与激活类 `.pk-active`、modal 节点 id 与 `<id>-close`、list 行 id、submit 按钮 `type="submit"`、toast 容器 `[data-proto-toast]`。交互用 React 状态真实实现（不经 proto-runtime），但**对外 DOM 契约不变**——G3 用同一套选择器断言两轨。

## 4. submit 合并契约

interactions 中 `submit@<formId>` 与「form 内 type=submit 按钮的 `tap@<btnId>`」**全部合并进 form 的 `data-proto-chain`**：

- 按钮本身不单独挂 chain，只设 `type="submit"`
- runtime 在 form submit 时：`preventDefault` → 校验 required → 失败 toast 错误 / 成功 toast + **顺序执行** chain
- 因此 IR 写法惯例：`submit@<formId>` 声明校验语义，`tap@login-btn` 上挂业务链（set-state / open-page 等）——黄金样例 p-login 即此形态

## 5. runtime 7 原语（`<ROOT>/templates/runtime/proto-runtime.js`，≤6KB 零依赖 IIFE）

| 原语 | 行为 |
|---|---|
| open-page | hash 切换到 `#<target>` |
| open-modal | target 选择器加 `.pk-open` |
| close-modal | target 选择器去 `.pk-open` |
| switch-tab | 读触发按钮 `data-proto-tab`，激活容器内匹配面板 |
| toggle-drawer | 抽屉开合 |
| submit | 见 §4 |
| set-state | 写 sessionStorage `proto-state`，随后重算所有 `[data-proto-if]` |

hash 路由：读 `location.hash` 显示匹配 `data-proto-page` 的 `.pk-page`；初始无 hash 定位 `data-proto-entry`。事件委托在 document 上监听 click/submit。toast 元素带 `[data-proto-toast]`，显示 2.5s。

## 6. B 轨工程形态（scaffold_react.mjs 产物）

- 模板：react@18 / react-dom@18 / react-router-dom@6 / vite@5 / typescript@5 / tailwindcss@3.4 / msw@2（版本锁死；shadcn 风格组件自研，不含 radix）
- 生成物：`src/tokens.css`（token 变量，与 A 轨同命名 `--<group>-<name>`）、`src/App.tsx` + `src/main.tsx`（HashRouter，入口重定向 flowGraph isEntry 页）、`src/routes/<pageId>/index.tsx`（stub，待 pagegen 填）、`src/shell/NavBar.tsx`（有 usesShell=default 页时；退出按钮 id=logout-btn）、`src/mocks/handlers.ts` + `src/lib/fixtures.json`（dataContract+fixtures → MSW：`GET /api/<entity复数小写>` 返回数组）
- 默认 scaffold 后自动 `npm install`；流水线内用 `--no-install` 跳过，装依赖留给收网/用户
