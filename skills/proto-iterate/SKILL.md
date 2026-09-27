---
name: proto-iterate
description: "原型局部迭代剧本：对已生成原型按用户修改指令做最小改动——定位受影响页、只重生成该页 PageSpec 与 B 轨 tsx、重发射重门禁、汇报变更清单。禁止顺手改未受影响页面。Triggers on /proto-iterate、改原型、调整页面、原型迭代、局部修改 prototype."
when_to_use: "proto-out/ 下已有可运行原型（跑过 /proto），用户提出局部修改指令（改某页布局/交互/文案/数据）时使用。从零生成原型用 proto-gen；环境问题用 env-setup。"
---

# proto-iterate — 原型局部迭代

你已有产物目录 `<cwd>/proto-out/`（designspec.json、ir/、fixtures.json、a-track/、b-track/、gates-report/）。迭代纪律只有一条总纲：**最小波及**——改动半径以"用户指令提到的页面"为限。

## 0. 插件根解析

定位插件根（取第一个存在者）：①`C:\Users\mojun\.zcode\cli\plugins\cache\local-plugins\daedalus\<version>\`（安装缓存，version 取目录实际值）②`C:\Users\mojun\plugins\daedalus\`（源目录）。下文 `<ROOT>` 即该路径。

命令均在 `<cwd>/proto-out/` 内执行。产物目录不存在时，说明尚未生成原型，引导用户先走 `/proto`。

## 1. 读指令，定影响面

1. 读用户修改指令。没说清改哪里就先问，不要猜。
2. 定位受影响页：
   - **静态分析**：对照指令逐条 diff `designspec.json` 的 pages/interactions/dataEntities 与 `ir/prototypeir.json`——指令动到的页面、以及 flowGraph 上因 target/trigger 变化被牵连的页面（如改了路由或页间跳转）。
   - **视觉辅助（必要时）**：指令描述的是观感问题时（"这页太挤"），派 `daedalus:judge` 读 `gates-report/screenshots/` 现状截图比对确认。
3. 产出一份**影响清单**：受影响页 id + 每页要改什么 + 是否动 tokens/registry/flowGraph/dataContract 全局物。**全局物受动时所有引用方都算受影响页**（如改 color.primary 令全部页面重发射），此时如实告知用户波及面较大。

## 2. 只重生成受影响物

- **PageSpec**：每个受影响页派一只 `daedalus:pagegen`（JSON 模式），prompt 与 proto-gen S3 同构——全局物只读注入（designTokens/componentRegistry/flowGraph/该页现状骨架）+ 黄金样例路径 `<ROOT>/templates/examples/sample.prototypeir.json` + 修改指令原文 + 输出路径 `ir/pages/<pageId>.json`。**未受影响页的 pages/<pageId>.json 一字不动。**
- **B 轨 tsx**：受影响页再派一只 pagegen（TSX 模式）重写 `b-track/src/routes/<pageId>/index.tsx`（prompt 含该页新 PageSpec + ui 组件清单 + 测试锚点约束，同 proto-gen S5）。
- **全局物**：指令确实要改 tokens/registry/flowGraph/dataContract 时，主会话直接改 `ir/prototypeir.json` 对应字段（改动最小化），必要时同步 `designspec.json` 保持两级 IR 一致。
- **fixtures**：指令涉及数据字段/实体时同步改 `fixtures.json`。

## 3. 校验、合并、重发射

1. 合并 pages 进 `ir/prototypeir.json` 后校验：

```bash
node <ROOT>/scripts/validate_ir.mjs ir/prototypeir.json
```

失败回注对应 pagegen，每页修复 ≤2 轮（沿用 proto-gen 回炉纪律）。

2. 重发射：
   - **A 轨整体重发是允许的**（单文件产物，重发即覆盖，成本低）：

```bash
node <ROOT>/scripts/emit_html.mjs ir/prototypeir.json -o a-track/prototype.html -m fixtures.json
```

   - **B 轨只动受影响文件**：重写的 `src/routes/<pageId>/index.tsx` + 被改的 scaffold 生成物（tokens.css/App.tsx/mocks 等仅当对应全局物变化时重跑 scaffold；重跑会覆盖 pagegen 已填的 tsx stub——**先备份受影响页 tsx 或重跑后重新派 pagegen**）。B 轨不重跑 `npm install`。

## 4. 重跑门禁

受影响页所在轨照常过门禁（口径见 proto-gen `references/gates-spec.md`）：

```bash
# A 轨
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --serve a-track --out gates-report

# B 轨（dev server 起在后台，默认 http://127.0.0.1:5173）
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --url http://127.0.0.1:5173 --out gates-report
```

硬门禁失败回注重生成，**本次迭代总回炉 ≤3 轮**；G2 视觉复核只对受影响页截图派 judge。

## 5. 汇报

固定格式收尾：**变更文件清单**（相对 proto-out/ 的路径 + 每文件一句话改了什么）+ 门禁结论 + 未受影响页"未动"的显式声明 + openIssues（若有）。

## 铁律

- **禁止**顺手改动未受影响页面——包括"看着不顺眼"的样式微调、格式化、重构。
- 两级 IR 必须同步：改了 PrototypeIR 的页面语义而 designspec.json 还留着旧描述，下次迭代就会拿到矛盾输入。
- 迭代不引入新依赖、不改插件自身文件。
