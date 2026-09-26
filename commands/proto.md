---
description: 从文字 PRD 生成双轨可交互原型（A 单文件 HTML + B React 工程），含 G0–G3 门禁与回炉
argument-hint: "<PRD 文件路径，或直接粘贴 PRD 内容>"
---

加载 `proto-gen` 技能，按其 S0–S6 剧本执行原型生成：$ARGUMENTS

- 参数为空时，先询问用户方案来源：PRD 文件路径，或直接粘贴 PRD 文本。
- 参数是存在的文件路径则读取该文件作为 PRD；否则视为粘贴的 PRD 正文。
- 产物落在 `<cwd>/proto-out/`；跑门禁前按 `env-setup` 技能确认 playwright 就绪。
