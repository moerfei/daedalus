---
description: 对已生成的原型做局部迭代：定位受影响页、只重生成该页并重跑门禁
argument-hint: "<修改指令, e.g. 订单页加一个导出按钮、登录页改主色>"
---

加载 `proto-iterate` 技能，执行原型局部迭代：$ARGUMENTS

- 参数为空时，先询问用户要改什么。
- 原型产物目录默认 `<cwd>/proto-out/`；不存在时说明尚未生成原型，引导先跑 `/proto`。
