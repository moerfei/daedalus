# daedalus（代达罗斯）

> 名字取自希腊神话的大工匠代达罗斯——为克里特岛造出迷宫、为儿子造出翅膀，把图纸变成实物的人。本插件做的事一样：让设计方案在流水线里长成可交互的原型。

设计方案 → 可交互 Web 原型生成流水线，ZCode 本地插件。v0.2 从**一句想法**起步：`/prd` 引导式创建规范 PRD → 双级 IR（DesignSpec / PrototypeIR）→ 双轨发射（A 单文件 HTML / B React+Vite+Tailwind+shadcn 工程）→ G0–G3 质量门禁 → 回炉闭环。图标即其意象：方形螺旋迷宫之上，三片金色羽翼破阵而出（`assets/draw_icon.py` 可重绘）。

## 架构（文字版五层）

```
[输入层]  一句想法 ──/prd 引导式创建──▶ 规范 PRD，或直接给文字 PRD（文件路径或粘贴）
   │  S0 结构化（主会话；/prd 产物已含 designspec.json 时跳过）   → designspec.json
[IR 层]   DesignSpec ── templates/designspec.schema.json
   │  S1+S2 规划（planner 代理）      → ir/prototypeir.json 骨架
   │  S3 逐页生成（pagegen × N 并行）→ ir/pages/<pageId>.json + 合并校验
[生成层]  PrototypeIR（完整）── templates/prototypeir.schema.json
   │  S5 双轨发射
[发射层]  ├ A 轨 emit_html.mjs ──→ a-track/prototype.html（单文件，双击即开）
   │      └ B 轨 scaffold_react.mjs ──→ b-track/ 工程 + pagegen 填 routes/<pageId>/index.tsx
   │  S6 门禁（gates.mjs + judge 代理）
[质量层]  G0 运行时零错 / G1 IR 校验 / G2 视觉评审 / G3 交互逐条 + 死链
          └─ 回炉闭环：错误原文回注重生成（单页修复 2–3 轮，总回炉 ≤3 轮）
```

方法论真源：`skills/prd-wizard/SKILL.md`（/prd 引导剧本）与 `skills/proto-gen/SKILL.md`（S0–S6 编排剧本）及其 `references/`（ir-spec / gates-spec / emission-spec）。

## 安装与重载（缓存拷贝制，重要）

本插件走本地 marketplace（local-plugins）。**ZCode 运行时读的是安装缓存，不是源目录**——改了 `C:\Users\mojun\plugins\daedalus\` 源码后，必须重新安装/重载才生效：

1. 源目录（唯一真源）：`C:\Users\mojun\plugins\daedalus\`
2. 安装缓存（运行时实际读取）：`C:\Users\mojun\.zcode\cli\plugins\cache\local-plugins\daedalus\<version>\`
3. 改源后的生效操作：在 ZCode 中对该插件执行重装/更新（或卸载后从 local-plugins 重新安装；改了 `plugin.json` 的 version 则以新版本号安装）。
4. 验证缓存已更新：对比缓存目录与源目录中同名文件（如 `skills/proto-gen/SKILL.md`）的内容或修改时间。

技能与代理内部统一按「插件根解析规则」定位 `<ROOT>`：取第一个存在者——①安装缓存 `...cache\local-plugins\daedalus\<version>\`（version 取目录实际值）②源目录 `C:\Users\mojun\plugins\daedalus\`。

## 用法

### /prd — 从一句想法引导创建 PRD

```
/prd <初始想法, e.g. 我想要一个团队待办事项管理工具>    # 空参则询问你想做什么
```

四轮主题分组问答（目标用户 → 范围页面 → 交互数据 → 风格边界，已说清的轮自动跳过，总轮数 ≤6），每轮答案即时落进渐进草稿 `proto-out/prd-draft.md`；**定稿前必须经你确认**。确认后产出：

```
proto-out/
├── prd/<name>.prd.md        # PRD 终稿（规范节骨架）
├── prd-draft.md             # 渐进草稿留档
└── designspec.json          # DesignSpec（validate 通过，可直接进流水线）
```

未拍板的分歧会如实写进 designspec 的 `openQuestions`，不替你做决定。定稿后询问是否立即 `/proto` 生成原型。

### /proto — 从 PRD 生成原型

```
/proto <PRD 文件路径>      # 或直接粘贴 PRD 正文；空参会询问方案来源
```

跑完整 S0–S6，产物落 `<cwd>/proto-out/`：

```
proto-out/
├── designspec.json / ir/prototypeir.json / ir/pages/
├── fixtures.json
├── a-track/prototype.html      # 双击即开
├── b-track/                    # npm install && npm run dev 后可跑
└── gates-report/               # gates-report.json + screenshots/
```

### /proto-iterate — 局部迭代

```
/proto-iterate <修改指令, e.g. 订单页加一个导出按钮>
```

只定位并重生成受影响页（A 轨整体重发、B 轨只动受影响文件），重跑门禁，汇报变更文件清单；**禁止**顺手改未受影响页面。

### 代理与技能

| 组件 | 角色 |
|---|---|
| skill `prd-wizard` | /prd 引导剧本：一句想法 → 规范 PRD + DesignSpec |
| skill `proto-gen` | S0–S6 主编排剧本（含 references 三份规范） |
| skill `proto-iterate` | 局部迭代剧本 |
| skill `env-setup` | 环境医生（node/npm/playwright） |
| agent `planner`（P） | PRD+DesignSpec → PrototypeIR 骨架 |
| agent `pagegen`（G） | 单页生成，JSON / TSX 双模式 |
| agent `judge`（V） | 截图三维打分，G2 视觉评审 |

## 脚本 CLI 一览

全部 Node ≥20 ESM（.mjs），零 npm 依赖（gates 的 playwright 除外）。成功 stdout 一行 `{ok:true,...}` exit 0；失败输出 errors/hints exit 1（gates 依赖缺失 exit 2）。`<ROOT>` 见上文插件根解析规则。

| 脚本 | CLI |
|---|---|
| 校验器 | `node <ROOT>/scripts/validate_ir.mjs <ir.json> [--kind prototypeir\|designspec]`（默认 prototypeir） |
| A 轨发射 | `node <ROOT>/scripts/emit_html.mjs <ir.json> -o <out.html> [-m fixtures.json]` |
| B 轨脚手架 | `node <ROOT>/scripts/scaffold_react.mjs <ir.json> -o <outDir> [--template <dir>] [--no-install]` |
| 门禁 | `node <ROOT>/scripts/gates.mjs --ir <ir.json> (--serve <dir\|file.html> [--port 8787] \| --url <http://...>) [--out <reportDir>]`（默认 reportDir=./gates-report） |
| 预览 | `node <ROOT>/scripts/preview.mjs <dir\|file.html> [--port 5179] [--open]` |
| 环境医生 | `node <ROOT>/scripts/env_doctor.mjs [--fix]` |

## 依赖要求

- **Node ≥ 20**、npm 可用（B 轨安装与 env_doctor --fix 需要）
- **playwright**：仅 G 门禁需要。解析顺序 `import('playwright')` → `~/.zcode/cli/plugins/data/daedalus@local-plugins/node_modules/playwright` → 指引安装（exit 2）。装在插件数据目录是为了不污染用户工程且多项目共享 chromium。不跑门禁时缺失无碍。

## v0.2 边界与路线

- 现版**仅文字通道**：输入只接受文字 PRD（含 /prd 引导创建）；图片 / Figma / 视频输入不支持。
- G2 视觉评审是打分 + 回注重生成，**不做自动视觉修复**（不调样式参数重发）。
- 生成物是原型不是生产代码；B 轨工程不承诺上线质量。
- 路线：v0.x 计划引入图片/Figma/视频输入通道、S6 视觉自修复闭环、rich 复杂度页的双轨策略细化。
