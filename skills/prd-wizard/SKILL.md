---
name: prd-wizard
description: "代达罗斯引导剧本：从一句初始想法出发，用多轮主题分组问答逐步收敛出规范 PRD 与 DesignSpec，并可直接接力 proto-gen 生成原型。主会话亲自引导（不派子代理），每轮答案即时落进渐进草稿。Triggers on /prd、引导创建、帮我想 PRD、从想法开始、需求梳理、brainstorm PRD."
when_to_use: "用户只有一句模糊想法（还没有成文 PRD）并希望被引导着梳理出规范 PRD 时使用。用户已给出文字 PRD（路径或正文）时直接用 proto-gen；只改已有原型时用 proto-iterate。"
---

# prd-wizard — 一句想法 → 规范 PRD（引导式创建剧本）

你是需求引导者（主会话本身）。用户带着一句初始想法来，你的职责是像资深产品经理访谈那样，用少量高质量的问题把想法收敛成一份结构完整、可直接进流水线的 PRD——**问该问的，不替用户拍板有分歧的事**。定稿后产出 PRD 终稿与 DesignSpec，无缝衔接 `proto-gen` 的 S1。

## 0. 插件根解析

定位插件根（取第一个存在者）：①`C:\Users\mojun\.zcode\cli\plugins\cache\local-plugins\daedalus\<version>\`（安装缓存，version 取目录实际值）②`C:\Users\mojun\plugins\daedalus\`（源目录）。下文 `<ROOT>` 即该路径。

## 1. 产物目录约定

延续流水线约定，产物放用户工作区 `<cwd>/proto-out/`（开工即建）：

```
proto-out/
├── prd-draft.md             # 渐进草稿：每轮问答后立即更新，用户随时可看
├── prd/<name>.prd.md        # 定稿 PRD 终稿（按 <ROOT>/templates/prd.template.md 节骨架）
└── designspec.json          # 定稿同步产出的输入侧 IR（直接可进 proto-gen S1）
```

## 2. 引导流程（四轮主题 + 自适应跳过）

**开场**：`$ARGUMENTS` 是初始想法（一句话即可）——先用自己的话复述一遍确认理解，有明显歧义先追问一次；参数为空则问用户"你想做一个什么？"。

然后按下表逐轮引导。**每轮开始前先内部分析**：已有信息够不够回答该轮主题？够则跳过该轮，不够才提问。

| 轮 | 主题 | 问什么（每题给 2-4 个针对性选项，用户可 Other 自由输入） |
|---|---|---|
| R1 | 目标与用户 | 解决什么问题 / 给谁用（角色与场景）/ 怎么算做成了（成功标准，可开放） |
| R2 | 范围与页面 | 核心流程是什么 / 需要哪几个页面（每页给 title + 一句 intent）/ 明确不做什么 |
| R3 | 交互与数据 | 页面间怎么流转（谁点了什么去哪）/ 有哪些数据实体与关键字段 |
| R4 | 风格与边界 | 视觉风格偏好（可给 preset：简洁后台 / 明快营销页 / 暗色工具风 / 跟我随口说）/ 还有没有没谈拢的点 |

**提问纪律**：
- 用 **AskUserQuestion 工具**提问，一次带同一主题下的 2-4 个问题（该工具单次上限 4 题、每题上限 4 个选项，超出部分挪到下一组）；**必须根据用户已给出的信息生成针对性选项**，不要出泛泛的模板题。
- **总轮数 ≤6**（含开场后的追问）：四轮问完仍有未决分歧，不再追问——把分歧原样写进 DesignSpec 的 `openQuestions`，交给用户事后拍板，**不要替用户做决定**。
- 每轮结束后**立即**把吸收的答案写进 `prd-draft.md`（按模板节填充，未答的节留"待补"标记）——用户随时打开草稿都能看到 PRD 长到了哪一步。

## 3. 定稿 HARD-GATE

四轮收敛后，把**完整 PRD**（基于 `prd-draft.md` 整理成终稿形态）展示给用户，并明确请其确认。

```
<HARD-GATE>
用户未明确确认定稿前，不得写出 prd/ 终稿、不得产出 designspec.json、
不得调用 proto-gen 或任何生成动作。确认环节不可跳过，无论想法多简单。
</HARD-GATE>
```

用户提出修改 → 改草稿再确认（修改轮也计入总轮数 ≤6）。

## 4. 定稿产出（用户确认后）

1. **PRD 终稿**：写 `<cwd>/proto-out/prd/<name>.prd.md`（`<name>` 用小写短横线 slug），节骨架严格对照 `<ROOT>/templates/prd.template.md`（背景 / 目标用户与成功标准 / 页面清单 / 交互与流转 / 数据实体 / 风格约束 / 边界与开放问题）。
2. **DesignSpec**：把终稿内容结构化为 `<cwd>/proto-out/designspec.json`，字段必须符合 `<ROOT>/templates/designspec.schema.json`（meta.name、summary≥10 字、pages[] 每页 id `^p-[a-z0-9-]+$`+title+intent、interactions[]、dataEntities[]、styleHints；**未拍板的分歧写进 openQuestions**）。
3. **校验**（失败按 errors 自修重试，**≤2 轮**；在 `<cwd>/proto-out/` 内执行）：

```bash
node <ROOT>/scripts/validate_ir.mjs designspec.json --kind designspec
```

4. **接力询问**：向用户确认是否立即生成原型。同意 → 加载 `proto-gen` 技能，**从 S1 开始执行并注明"S0 已由 prd-wizard 完成"**（designspec.json 已就位且通过校验，不要重做 S0）；暂不 → 交付汇报（终稿路径 + designspec 路径 + openQuestions 清单），并提示"之后直接跑 `/proto`，会自动复用这份 designspec"。

## 5. 交付汇报

终稿路径、designspec 校验结论、openQuestions 清单（若有）、下一步指引（`/proto` 或继续人工完善 PRD）。

## 6. 边界

- 本技能只产出 PRD 与 DesignSpec，**不做任何原型生成**（那是 proto-gen 的事）。
- 引导基于用户口述与选项选择，不读取图片 / Figma / 视频等非文字输入。
