# IR 规范 — 两级中间表示（权威字段说明）

daedalus 用两级 IR 隔离"需求理解"与"生成细节"：

| 层 | 文件 | 角色 | 产生于 | 校验 |
|---|---|---|---|---|
| DesignSpec（输入侧） | `designspec.json` | 把文字 PRD 结构化：页面清单 / 交互清单 / 数据实体 / 风格提示 | S0 主会话 | `validate_ir.mjs --kind designspec` |
| PrototypeIR（生成侧） | `ir/prototypeir.json` | 可发射的完整描述：tokens / 组件白名单 / 页流 / 每页布局与交互 | S1+S2 planner 出骨架，S3 pagegen 填每页 | `validate_ir.mjs`（默认 kind） |

schema 是契约真源：`<ROOT>/templates/designspec.schema.json` 与 `<ROOT>/templates/prototypeir.schema.json`。本文是它们的可读展开。

## 1. DesignSpec 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `meta` | 是 | `{name, sourceFile?}`；name 必填 |
| `summary` | 是 | ≥10 字的产品一句话概述 |
| `pages[]` | 是（≥1） | 每页 `{id, title, intent, features?}`；id 必须 `^p-[a-z0-9-]+$` |
| `interactions[]` | 是 | 跨页流转 `{from, to, trigger, description, guard?}`；from/to 是 page id |
| `dataEntities[]` | 是 | `{entity, fields}`；fields 是 `字段名: 类型字符串` 映射，≥1 个 |
| `styleHints` | 否 | 风格提示（主色 / 基调等），planner 译成 designTokens 的依据 |
| `openQuestions[]` | 否 | PRD 歧义记录——**有歧义就记这里，不要替用户拍板** |

## 2. PrototypeIR 字段（顶层）

| 字段 | 必填 | 说明 |
|---|---|---|
| `meta` | 是 | `{id, name, version, createdAt?, sourceRefs?}`；id `^[a-z0-9][a-z0-9-]*$` |
| `designTokens` | 是 | 两组嵌套：`<group>.<name> → {$type, $value}`；`$type` ∈ color/dimension/fontFamily/fontWeight/typography/shadow/borderRadius |
| `componentRegistry[]` | 是（≥1） | 组件白名单：`{name ^[A-Z]..., source, variants?, propsSchema?, interactiveComplexity}`；complexity ∈ static/basic/rich |
| `constraints` | 否 | 布局约束（如 maxPageLevels、navigationStyle） |
| `flowGraph` | 是 | `{nodes:[{page, isEntry?}], edges:[{from,to,trigger?,guard?}]}`；**必须有且仅有一个 isEntry 页**（emit 据此定位首页） |
| `pages[]` | 是（≥1） | 见下节 |
| `dataContract[]` | 否 | `{entity, fields}`；fixtures.json 与 B 轨 MSW 的数据契约 |

## 3. page 对象

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | `^p-[a-z0-9-]+$`，全文档唯一 |
| `route` | 是 | `^/[a-zA-Z0-9/-]*$`，唯一（A 轨 hash 路由 `#<pageId>`、B 轨 `/<pageId>` 都从 id/route 派生） |
| `title` | 是 | 展示标题 |
| `intent` | 是 | ≥4 字——这页存在的业务理由，pagegen 的布局总纲 |
| `usesShell` | 否 | `"default"` 时套 B 轨 NavBar shell |
| `interactiveComplexity` | 是 | static / basic / rich，决定双轨发射（见 emission-spec.md） |
| `layoutTree` | 是 | 布局树，见 node |
| `states[]` / `interactions[]` | 否 | 页内状态 / 交互（trigger `^(tap|submit)@[a-zA-Z0-9_-]+$`，action 7 原语） |

## 4. layoutTree 节点（node）

| 字段 | 说明 |
|---|---|
| `type` | 必填，8 种：`section` / `component` / `text` / `image` / `list` / `form` / `input` / `button` |
| `id` | `^[a-zA-Z0-9_-]+$`；**交互可达性与 A 轨 DOM id 都靠它**，命名要语义化（login-btn、orders-list-all） |
| `ref` | 组件名，**必须命中 componentRegistry**（全树校验） |
| `style` | 值一律 `token:<group>.<name>`，且键必须存在于 designTokens——**禁止裸色值/裸字号** |
| `text` / `props` / `intent` | 文本内容（button 文本取 props.text）/ 组件属性 / 节点语义注释 |
| `binding` | list 专用：绑定的 fixtures 实体键（如 `orders`） |
| `children[]` | 子节点递归 |

## 5. interaction

- `trigger`：`tap@<id>` 或 `submit@<formId>`，@ 后缀是元素 id（含自动生成 id：`tab-<tab名>`、`<listId>-row-<n>`、`<dialogId>-close`）
- `action`（7 原语）：`open-page` / `open-modal` / `close-modal` / `switch-tab` / `toggle-drawer` / `submit` / `set-state`
- `target`：open-page 用 page id；open-modal/close-modal 用选择器（`#<dialogId>`）；switch-tab 用 Tabs 容器 id
- `state`：set-state 用 `key=value`（扁平 kv，存 sessionStorage `proto-state`）

## 6. 跨字段校验规则（validate_ir 的 6 条）

1. style 值必须 `token:` 前缀且 `<group>.<name>` 存在于 designTokens
2. 节点 ref 必须命中 componentRegistry（layoutTree 全树）
3. interactions 的 trigger @id 必须在该页 layoutTree 可达（自动 id 放宽：`<listId>-row-<n>` 按 fixtures 行数 / 3 取上限）
4. open-page 的 target 必须是 pages 的 id 且出现在 flowGraph.nodes
5. route 唯一、page id 唯一、flowGraph.edges 的 from/to 必须是存在的 page
6. 顶层必填 + enum/pattern 抽查（page id `^p-`、interactiveComplexity enum、action enum 等）

## 7. 黄金样例解读（`<ROOT>/templates/examples/sample.prototypeir.json`）

两页订单系统，pagegen 的 one-shot 范例。读它的三个要点：

1. **登录页（p-login）**：Card 包 form，form 内两个 required input + 一个 primary button。注意 interactions：`submit@login-form` 只声明 action=submit；跳转逻辑写在 `tap@login-btn` 的链上（set-state + open-page）——这正是 submit 合并契约的形态：按钮不单独挂链，runtime 在 form submit 成功后顺序执行合并链（见 emission-spec.md §3）。
2. **订单页（p-orders）**：NavBar（usesShell=default）→ Tabs 三面板（每面板 props `{tab, label}`，内各一个 list，filter `status=all/paid/pending`）→ Dialog 详情弹窗。interactions 全部指向**自动生成 id**：`tab-all` / `tab-paid` / `tab-pending`（tab 按钮）、`orders-list-all-row-1`（list 首行）、`modal-order-detail-close`（弹窗关闭钮）——这些 id 不出现在 layoutTree 里，由发射器按 ID 规则表生成。
3. **tokens / registry**：color/radius/typography 三组、7 个组件（含 custom 的 NavBar）；planner 起骨架时照这个粒度给，pagegen 只消费不新增——**需要新组件必须回到 planner 改 registry，不许页内私加**。
