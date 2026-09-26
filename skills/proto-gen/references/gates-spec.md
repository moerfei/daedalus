# 门禁规范 — G0–G3 判据、回炉纪律、G2 打分口径

门禁由 `<ROOT>/scripts/gates.mjs`（playwright）执行，命令两式：

```bash
# A 轨：内置静态服务（file.html 所在目录，/ 重定向到该文件）
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --serve a-track --out gates-report

# B 轨：直连 dev server
node <ROOT>/scripts/gates.mjs --ir ir/prototypeir.json --url http://127.0.0.1:5173 --out gates-report
```

报告落 `<reportDir>/gates-report.json`（默认 `./gates-report`），截图落 `<reportDir>/screenshots/<pageId>.png`（viewport 1280x800）。**exit 语义：硬门禁全过 exit 0；否则 exit 1；playwright 缺失 exit 2**（解析顺序见 env-setup 技能）。

## 1. 四档判据

| 档 | 名称 | 判据 | 执行者 | 硬/软 |
|---|---|---|---|---|
| G0 | 运行时零错 | 每页 pageerror=0 且 console.error=0（哨兵先挂再导航） | gates.mjs | 硬 |
| G1 | IR 结构合法 | validate_ir exit 0（token 引用 / ref 白名单 / trigger 可达 / flowGraph 一致） | validate_ir.mjs，发射前 | 硬（前置） |
| G2 | 视觉评审 | judge 对 screenshots 三维打分，appearance ≥4 | judge 代理 | 软（<4 回注） |
| G3 | 交互逐条 | 从 IR interactions 逐条驱动 DOM 并断言 | gates.mjs | 硬 |
| — | 死链扫描 | 所有 open-page target 是存在的 pageId；所有 open-modal target 选择器在对应页 DOM 存在 | gates.mjs | 硬 |

G3 的逐条断言口径（A/B 两轨同一套选择器）：

| interaction | 驱动 | 断言 |
|---|---|---|
| `tap@id` + open-page | click | `location.hash === '#'+target` |
| `tap@id` + open-modal | click | target 选择器可见 |
| `tap@id` + close-modal | click | target 选择器隐藏 |
| `tap@tab-<名>` + switch-tab | click `#tab-<名>` | 面板 `[data-proto-panel="<名>"]` 有 `.pk-active` 且按钮 `aria-selected="true"` |
| `tap@id` + set-state | — | 直接 pass（无 DOM 断言） |
| `submit@<formId>` | 导航到该页 → 填齐 form 内 required input → click `button[type=submit]` | `[data-proto-toast]` 可见 |
| `tap@按钮` 且按钮是某 form 内 submit 按钮 | 按 submit 流程执行 | 同上（与 A 轨合并契约一致） |

点击前若目标元素在非当前 hash 页，先导航到所属页。等待策略 waitForSelector、timeout ≥2s。

## 2. G2 打分口径（judge 代理）

对 `gates-report/screenshots/` 每页截图按三维各打 1-5 分：

- **appearance**：视觉完成度——布局是否成型、间距/对齐、token 用色是否贯彻、无破版
- **content**：内容符合度——页面元素与 PageSpec intent/layoutTree 是否对应、文案合理
- **interaction-ready**：可交互观感——tab/modal/form 等交互件是否呈现为可点/可填的形态

输出 JSON：`{pages:[{page, scores:{appearance,content,"interaction-ready"}, issues:[...]}], summary:"一句话总评"}`。

**处置**：appearance <4 → 回注对应页 pagegen 重生成（计入总回炉）；content / interaction-ready 的问题进 issues 清单，主会话裁量。

## 3. 回炉纪律

| 回炉点 | 上限 | 超限动作 |
|---|---|---|
| S0 / S1+S2 校验自修 | 各 ≤2 轮 | 停止，问题写 openIssues |
| S3 单页 pagegen 修复 | 每页 2–3 轮 | 该页标 openIssues 请人工 |
| S6 硬门禁 / G2 回注 | **总回炉 ≤3 轮** | 停止，剩余失败项写 openIssues |

要点：
- 回注必须带**证据原文**（gates 失败 check 的 name/pass/detail、judge 的 issues），让责任代理对着证据修。
- IR 层失败（死链、trigger 不可达、target 不存在）回 planner / 对应页 pagegen；纯渲染疑点先对照 emission-spec.md 的 ID 规则表再定责。
- 每轮回炉后重跑对应轨 gates；两轨独立计通过状态，但回炉轮次**合并计数**。
- 触顶不是失败终点：产物照常交付，openIssues 里写清"哪条 check 未过、证据是什么、建议人工怎么处理"。
