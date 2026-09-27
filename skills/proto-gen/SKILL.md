---
name: proto-gen
description: "代达罗斯主剧本：把文字 PRD 经 DesignSpec→PrototypeIR 双级 IR 编排成双轨可交互原型（A 单文件 HTML / B React+Vite+Tailwind+shadcn），以 G0–G3 门禁与回炉闭环收口。派 planner/pagegen/judge 子代理分工，主会话负责结构化、合并、校验、发射与门禁调度。Triggers on /proto、生成原型、PRD 转原型、原型流水线、prototype generation、design-to-code."
when_to_use: "用户给出文字 PRD（文件路径或粘贴正文）并要求生成可交互 Web 原型，或需要端到端跑 S0–S6 流水线（含双轨发射与门禁）时使用。只改已有原型的局部时改用 proto-iterate；只查环境时改用 env-setup。"
---

# proto-gen — 文字 PRD → 双轨可交互原型（S0–S6 编排剧本）

你是流水线编排者（主会话本身）。本剧本把一份文字 PRD 铸成双轨可交互原型：A 轨单文件 HTML（零依赖、双击即开）、B 轨 React+Vite+Tailwind+shadcn 工程，并以 G0–G3 门禁与回炉闭环收口。重活派给子代理（`daedalus:planner` / `daedalus:pagegen` / `daedalus:judge`），你负责结构化、合并、校验、发射与门禁调度——**你不逐页手写布局**。

规范细节不背在身上，按需查阅本技能 `references/`：
- `references/ir-spec.md` — 两级 IR 字段权威说明 + 黄金样例解读
- `references/gates-spec.md` — G0–G3 判据、回炉纪律、G2 打分口径
- `references/emission-spec.md` — 双轨规则、ID/属性生成规则表、submit 合并契约、runtime 7 原语

## 0. 插件根解析

定位插件根（取第一个存在者）：①`C:\Users\mojun\.zcode\cli\plugins\cache\local-plugins\daedalus\<version>\`（安装缓存，version 取目录实际值）②`C:\Users\mojun\plugins\daedalus\`（源目录）。下文 `<ROOT>` 即该路径。

## 1. 产物目录约定

产物固定放用户工作区 `<cwd>/proto-out/`（开工即建）：

```
proto-out/
├── designspec.json          # S0 产物：输入侧 IR
├── ir/
│   ├── prototypeir.json     # S1+S2 产物 + S3 合并后的完整生成侧 IR
│   └── pages/<pageId>.json  # S3 各页 PageSpec（pagegen 的单页输出）
├── fixtures.json            # mock 数据（每实体 4-6 行）
├── a-track/
│   └── prototype.html       # A 轨单文件产物
├── b-track/                 # B 轨 React 工程（scaffold + pagegen 填充）
└── gates-report/            # S6 门禁报告 + screenshots/
```

下文所有命令都在 `<cwd>/proto-out/` 内执行，相对路径以该目录为基准。

## 2. S0 — PRD → DesignSpec（主会话）

1. 读 PRD：`$ARGUMENTS` 给了路径则读文件；给的是正文则直接用；都没给就先问用户要。
2. 产出 `designspec.json`：把 PRD 结构化为页面清单 / 交互清单 / 数据实体 / 风格提示，字段必须符合 `<ROOT>/templates/designspec.schema.json`（meta.name、summary≥10 字、pages[] 每页 id `^p-[a-z0-9-]+$`+title+intent、interactions[]、dataEntities[]、styleHints、openQuestions——PRD 有歧义就写进 openQuestions，不要替用户拍板）。
3. 校验（失败则按 errors 自修重试，**≤2 轮**）：

```bash
node <ROOT>/scripts/validate_ir.mjs designspec.json --kind designspec
```

## 3. S1+S2 — DesignSpec → PrototypeIR 骨架（派 planner）

派 `daedalus:planner` 一只，**自包含 prompt** 必须含：PRD 全文 + DesignSpec 全文 + 两份 schema 路径（`<ROOT>/templates/designspec.schema.json`、`<ROOT>/templates/prototypeir.schema.json`）+ 输出路径 `ir/prototypeir.json`。代理看不到你的会话，缺一项它就写不对。

预期产物：`ir/prototypeir.json` 骨架——meta / designTokens / componentRegistry / constraints / flowGraph / dataContract 齐全，`pages[]` 每页给 id / route / title / intent / usesShell / interactiveComplexity，layoutTree 只留最小占位（如 `{"type":"section","id":"<pageId>-root"}`，由 S3 填充）。

回来后主会话校验（骨架允许暂缺每页 layoutTree 细节，但顶层结构与 flowGraph 必须已合法；失败回注 planner 重试，≤2 轮）：

```bash
node <ROOT>/scripts/validate_ir.mjs ir/prototypeir.json
```

## 4. S3 — 逐页 PageSpec（并行派 pagegen）

1. 从 `ir/prototypeir.json` 取每页骨架，**每页派一只 `daedalus:pagegen`，在同一条消息里并行发起全部调用**。
2. 每份 prompt 必须自包含：
   - **全局物只读注入**（直接贴 JSON 全文，不许让代理自己去读 prototypeir.json）：designTokens、componentRegistry、flowGraph、该页骨架（id/route/title/intent/usesShell/interactiveComplexity）
   - **黄金样例路径**作 one-shot 范例：`<ROOT>/templates/examples/sample.prototypeir.json`
   - 模式声明：本次产 JSON PageSpec
   - 输出路径：`ir/pages/<pageId>.json`，**只含该页 page 对象**（id/route/title/intent/usesShell/interactiveComplexity/layoutTree/interactions）
   - 字段与跨字段规则：指向 `<ROOT>/skills/proto-gen/references/ir-spec.md` 与 `emission-spec.md`
3. 主会话合并：读全部 `ir/pages/*.json`，按骨架页序替换 `ir/prototypeir.json` 的 `pages[]` 对应项 → 校验：

```bash
node <ROOT>/scripts/validate_ir.mjs ir/prototypeir.json
```

4. 失败处理：把 validate 输出的 errors **原文**（含 path/rule/message）回注给 path 所属页的那只 pagegen 重试。**修复轮上限 2–3 轮**（默认 2 轮，布局复杂的页至多 3 轮）；超限即停止重试，把该页问题写进交付汇报的 `openIssues` 清单请人工处理，不要无限循环。

## 5. mock — fixtures.json（主会话）

按 `ir/prototypeir.json` 的 dataContract 生成 `fixtures.json`：每个实体 4-6 行贴近业务的数据，字段名与 dataContract 完全一致，**键名用实体名复数小写**（如 `Order`→`orders`），格式参照 `<ROOT>/templates/mock/fixture.template.json`（被 list 绑定的实体给数组；单例实体如 user 可给对象）。A 轨 list 渲染与 B 轨 MSW handlers 都吃这份文件。

## 6. S5 — 双轨发射

**A 轨（一次成型）**：

```bash
node <ROOT>/scripts/emit_html.mjs ir/prototypeir.json -o a-track/prototype.html -m fixtures.json
```

**B 轨（脚手架 + 逐页填充）**：

```bash
node <ROOT>/scripts/scaffold_react.mjs ir/prototypeir.json -o b-track --no-install
```

`--no-install` 是刻意的：npm install 耗时且可能失败，**留给收网阶段或用户**。需要跑 B 轨门禁（S6）或让用户本地 `npm run dev` 前，在 `b-track/` 内执行 `npm install --no-audit --no-fund` 一次即可。

scaffold 产出的是页 stub（`src/routes/<pageId>/index.tsx` 带 `// PAGEGEN-TODO`）。随后**每页再派一只 `daedalus:pagegen`**（同样并行派发），prompt 自包含：
- 该页 PageSpec 全文（`ir/pages/<pageId>.json` 的内容）
- 可用 ui 组件清单：`src/components/ui/` 下的 button/input/card/tabs/dialog/badge（shadcn 风格自研，props 用法见组件文件，让代理自行 Read `b-track/src/components/ui/`）
- one-shot tsx 范例（模式声明：本次产 TSX）
- 输出路径 `b-track/src/routes/<pageId>/index.tsx`，只写该文件
- 硬约束：Tailwind + `src/tokens.css` 变量取色；**保留与 A 轨一致的测试锚点**（元素 id、`tab-<名>` 按钮、面板 `data-proto-panel`、modal id 与 `<id>-close`、submit 按钮 `type="submit"`——G3 门禁按同一套选择器断言两轨，丢了锚点门禁必挂）；交互用 React 状态真实实现（不经 proto-runtime）

## 7. S6 — 门禁与回炉

1. **环境**：先走 `env-setup` 技能确认 playwright 就绪（gates 对 playwright 缺失会 exit 2）。
2. **A 轨门禁**（内置静态服务）：

```bash
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --serve a-track --out gates-report
```

3. **B 轨门禁**（装好依赖后）：在 `b-track/` 起 dev server（后台任务 `npm run dev`，默认 `http://127.0.0.1:5173`），再：

```bash
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --url http://127.0.0.1:5173 --out gates-report
```

4. **硬门禁**（G0 运行时零错 + G3 交互逐条 + 死链扫描）失败 → 把失败 check 的 name/pass/detail **原文回注**给责任方重生成：IR 层问题回 planner / 对应页 pagegen，发射层疑点先查 `references/emission-spec.md` 的 ID 规则表。**总回炉轮上限 3**（含 A/B 两轨全部重试），超限停止并把剩余失败项写进 openIssues。
5. **G2 视觉**：硬门禁过后派 `daedalus:judge` 读 `gates-report/screenshots/` 打分（appearance 1-5 + 问题清单，口径见 `references/gates-spec.md`）。appearance **<4 分回注**对应页 pagegen 重生成（计入总回炉轮次）；content / interaction-ready 的问题进 issues 清单，主会话裁量是否随下一轮回炉一并处理。
6. 每轮回炉后重跑对应轨的 gates，直到通过或触顶。

## 8. 预览与交付

- A 轨预览（默认端口 5179，`--open` 尽力拉起浏览器）：

```bash
node <ROOT>/scripts/preview.mjs a-track/prototype.html --open
```

- B 轨预览：`cd b-track && npm run dev`（Vite 默认 5173）。
- 交付汇报：产物文件清单（相对 `proto-out/`）、门禁结论（G0/G3/死链/G2 分数）、预览地址、openIssues（若有）。A 轨 html 双击即开，可直接发给用户。

## 9. 回炉纪律（总则）

| 回炉点 | 上限 | 超限动作 |
|---|---|---|
| S0 / S1+S2 校验自修 | 各 ≤2 轮 | 停止重试，问题写 openIssues |
| S3 单页 pagegen 修复 | 每页 2–3 轮 | 该页标 openIssues 请人工 |
| S6 硬门禁 / G2 回注重生成 | **总回炉 ≤3 轮** | 停止，剩余失败项写 openIssues |

回炉的本质是**错误原文回注**：把 validate/gates 的 errors 与失败 check 原样贴给责任代理，让它对着证据修，而不是泛泛地"再试一次"。

## 10. v0.1 边界

- **仅文字通道**：输入只接受文字 PRD；图片 / Figma / 视频输入不在本版。
- S6 视觉评审是打分 + 回注，**不做视觉自修复**（不自动调样式参数重发）。
- 生成物是原型，不是生产代码；B 轨工程不承诺上线质量。
