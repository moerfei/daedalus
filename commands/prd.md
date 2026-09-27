---
description: 从一句初始想法引导式创建规范 PRD：多轮主题问答逐步收敛，产出 PRD 终稿 + DesignSpec，可接力生成原型
argument-hint: "<初始想法, e.g. 我想要一个团队待办事项管理工具>"
---

加载 `prd-wizard` 技能，执行引导式 PRD 创建：$ARGUMENTS

- 参数为空时，先询问用户想做一个什么（一句话即可，不用组织语言）。
- 引导产物落在 `<cwd>/proto-out/`：渐进草稿 `prd-draft.md`、定稿 `prd/<name>.prd.md` + `designspec.json`。
- 定稿前必须经用户确认（技能内 HARD-GATE）；确认后询问是否直接接力 `/proto` 生成原型。
