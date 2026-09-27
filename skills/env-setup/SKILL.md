---
name: env-setup
description: "daedalus 环境医生：检查 Node≥20、npm、playwright 是否就绪，展示修复指引并可在征得同意后执行 --fix 安装。Triggers on /env 检查、环境诊断、playwright 安装、门禁前置检查、env doctor."
when_to_use: "跑 G 门禁前确认 playwright 可用、gates.mjs exit 2 需要装依赖、或用户要求检查/修复 daedalus 运行环境时使用。"
---

# env-setup — 环境医生

## 0. 插件根解析

定位插件根（取第一个存在者）：①`C:\Users\mojun\.zcode\cli\plugins\cache\local-plugins\daedalus\<version>\`（安装缓存，version 取目录实际值）②`C:\Users\mojun\plugins\daedalus\`（源目录）。下文 `<ROOT>` 即该路径。

## 1. 检查

```bash
node <ROOT>/scripts/env_doctor.mjs
```

stdout 一行 JSON：`{node, npm, playwright:{ok, path}, missing, hints}`。逐项读给用户：node 版本是否 ≥20、npm 是否可用、playwright 是否命中。

## 2. 修复（须征得同意）

`missing` 非空时：**先展示 hints 原文，问用户是否执行修复**，同意后再跑：

```bash
node <ROOT>/scripts/env_doctor.mjs --fix
```

`--fix` 会在插件数据目录下 `npm init -y` + `npm i playwright@1.x --no-audit --no-fund` + `npx playwright install chromium`（继承 stdio）。下载失败时把脚本输出的镜像 hint 转给用户（`PLAYWRIGHT_DOWNLOAD_HOST` 与 npmmirror 源）。修完重跑第 1 步的检查命令确认全绿。

## 3. 为什么 playwright 装在插件数据目录

gates.mjs 解析 playwright 的顺序是：`import('playwright')` → 失败则找 `~/.zcode/cli/plugins/data/daedalus@local-plugins/node_modules/playwright` → 再失败打印安装指引（env_doctor --fix）并 exit 2。

装在插件数据目录而非用户项目里，原因有三：
1. **不污染用户工程**——门禁是插件的验收工具，依赖不该混进原型产物（尤其 B 轨工程有自己的 package.json）；
2. **一份共享**——所有原型项目共用同一份 playwright 与 chromium 二进制，避免每个项目重装数百 MB；
3. **路径确定**——gates 的第二跳解析就指向这里，缺失时指引可直达。

注意：脚本本体零 npm 依赖（只用 node: 内置模块），playwright 是唯一例外，且仅 G 门禁需要它——不跑门禁时缺 playwright 不影响 S0–S5。
