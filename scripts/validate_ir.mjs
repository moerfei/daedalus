#!/usr/bin/env node
// validate_ir.mjs — PrototypeIR / DesignSpec 手写结构校验 + 跨字段规则（零依赖，Node≥20 ESM）
// 用法：node validate_ir.mjs <ir.json> [--kind prototypeir|designspec]（默认 prototypeir）
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KINDS = ['prototypeir', 'designspec'];

function fail(errors) { console.log(JSON.stringify({ ok: false, errors })); process.exit(1); }

// ---------- 迷你 JSON Schema 校验器（draft-07 子集：type/required/properties/additionalProperties/items/enum/pattern/minLength/minItems/minProperties/$ref） ----------
function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let cur = root;
  for (const k of ref.slice(2).split('/')) { if (cur == null || cur[k] === undefined) return null; cur = cur[k]; }
  return cur;
}
function typeOf(v) { if (v === null) return 'null'; if (Array.isArray(v)) return 'array'; return typeof v; }
function validate(v, sch, path, root, errs) {
  if (!sch || typeof sch !== 'object') return;
  if (sch.$ref) {
    const r = resolveRef(root, sch.$ref);
    if (r) validate(v, r, path, root, errs);
    else errs.push({ path, rule: '$ref', message: `无法解析引用 ${sch.$ref}` });
    return;
  }
  if (sch.type) {
    const t = typeOf(v);
    const ok = sch.type === 'integer' ? (t === 'number' && Number.isInteger(v))
      : sch.type === 'number' ? t === 'number'
      : t === sch.type;
    if (!ok) { errs.push({ path, rule: 'type', message: `应为 ${sch.type}，实为 ${t}` }); return; }
  }
  if (sch.enum && !sch.enum.includes(v)) errs.push({ path, rule: 'enum', message: `值 ${JSON.stringify(v)} 不在枚举 [${sch.enum.join(', ')}] 内` });
  if (typeof v === 'string') {
    if (sch.pattern && !new RegExp(sch.pattern).test(v)) errs.push({ path, rule: 'pattern', message: `"${v}" 不匹配 ${sch.pattern}` });
    if (sch.minLength !== undefined && v.length < sch.minLength) errs.push({ path, rule: 'minLength', message: `长度 ${v.length} < 最小 ${sch.minLength}` });
  }
  if (Array.isArray(v)) {
    if (sch.minItems !== undefined && v.length < sch.minItems) errs.push({ path, rule: 'minItems', message: `元素数 ${v.length} < 最小 ${sch.minItems}` });
    if (sch.items) v.forEach((x, i) => validate(x, sch.items, `${path}[${i}]`, root, errs));
  } else if (v && typeof v === 'object') {
    if (sch.required) for (const k of sch.required) if (!(k in v)) errs.push({ path, rule: 'required', message: `缺少必填字段 "${k}"` });
    if (sch.properties) for (const [k, sub] of Object.entries(sch.properties)) if (k in v) validate(v[k], sub, `${path}.${k}`, root, errs);
    if (sch.additionalProperties !== undefined) {
      const extra = Object.keys(v).filter(k => !sch.properties || !(k in sch.properties));
      if (sch.additionalProperties === false) for (const k of extra) errs.push({ path: `${path}.${k}`, rule: 'additionalProperties', message: `不允许的字段 "${k}"` });
      else if (typeof sch.additionalProperties === 'object') for (const k of extra) validate(v[k], sch.additionalProperties, `${path}.${k}`, root, errs);
    }
    if (sch.minProperties !== undefined && Object.keys(v).length < sch.minProperties) errs.push({ path, rule: 'minProperties', message: `属性数 ${Object.keys(v).length} < 最小 ${sch.minProperties}` });
  }
}

// ---------- 跨字段规则 ----------
function walkTree(n, path, fn) {
  if (!n || typeof n !== 'object') return;
  fn(n, path);
  (n.children || []).forEach((c, i) => walkTree(c, `${path}.children[${i}]`, fn));
}

function crossPrototype(ir, errs) {
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  const pageIds = new Set(pages.map(p => p && p.id).filter(Boolean));
  // 规则 5：page id 唯一 / route 唯一
  const seenId = new Set(); const seenRoute = new Map();
  pages.forEach((p, i) => {
    if (!p) return;
    if (p.id) { if (seenId.has(p.id)) errs.push({ path: `pages[${i}].id`, rule: 'page-id-unique', message: `页面 id 重复："${p.id}"` }); seenId.add(p.id); }
    if (p.route) { if (seenRoute.has(p.route)) errs.push({ path: `pages[${i}].route`, rule: 'route-unique', message: `路由重复："${p.route}"（首见 pages[${seenRoute.get(p.route)}]）` }); else seenRoute.set(p.route, i); }
  });
  // token / registry / flowGraph 索引
  const tokens = new Set();
  for (const [g, grp] of Object.entries(ir.designTokens || {})) for (const n of Object.keys(grp || {})) tokens.add(`${g}.${n}`);
  const registry = new Set((ir.componentRegistry || []).map(c => c && c.name).filter(Boolean));
  const flow = ir.flowGraph || {};
  const flowPages = new Set((flow.nodes || []).map(n => n && n.page).filter(Boolean));
  // 规则 5：flowGraph 端点必须是存在的 page
  (flow.nodes || []).forEach((n, i) => { if (n && !pageIds.has(n.page)) errs.push({ path: `flowGraph.nodes[${i}].page`, rule: 'edge-endpoint', message: `"${n.page}" 不是已定义页面` }); });
  (flow.edges || []).forEach((e, i) => {
    if (!e) return;
    if (!pageIds.has(e.from)) errs.push({ path: `flowGraph.edges[${i}].from`, rule: 'edge-endpoint', message: `from "${e.from}" 不是已定义页面` });
    if (!pageIds.has(e.to)) errs.push({ path: `flowGraph.edges[${i}].to`, rule: 'edge-endpoint', message: `to "${e.to}" 不是已定义页面` });
  });
  // 规则 7：layoutTree 显式 id 跨页唯一（A 轨多 section 共 DOM，重复 id 会让选择器歧义、
  // 门禁的 byId 索引被覆盖 —— 导航按钮只在"物理所在页"声明，当前页不需要跳自己的按钮）
  const idOwner = new Map();
  pages.forEach((p, i) => {
    if (!p) return;
    walkTree(p.layoutTree, `pages[${i}].layoutTree`, (n, path) => {
      if (n && n.id) {
        if (idOwner.has(n.id) && idOwner.get(n.id).page !== p.id) {
          errs.push({ path, rule: 'id-cross-page-unique', message: `元素 id "${n.id}" 跨页重复（首见 ${idOwner.get(n.id).page}，本页 ${p.id}）——导航/共享控件只声明在物理所在页，A 轨单 DOM 下重复 id 会导致选择器歧义` });
        } else if (!idOwner.has(n.id)) {
          idOwner.set(n.id, { page: p.id });
        }
      }
    });
  });
  pages.forEach((p, pi) => {
    if (!p || !p.layoutTree) return;
    // 规则 3：本页可达 id 集（含自动 id：tab-<tab名>、<listId>-row-<n>、<dialogId>-close）
    // list 行数在无 fixtures 上下文时按占位 3 行放宽（n<=max(3,行数) 的保守侧）
    const reach = new Set();
    walkTree(p.layoutTree, `pages[${pi}].layoutTree`, (n, np) => {
      if (n.id) reach.add(n.id);
      if (n.ref === 'Tabs') (n.children || []).forEach(c => { if (c && c.props && c.props.tab != null) reach.add(`tab-${c.props.tab}`); });
      if (n.ref === 'Dialog' && n.id) reach.add(`${n.id}-close`);
      if (n.type === 'list' && n.id) for (let r = 1; r <= 3; r++) reach.add(`${n.id}-row-${r}`);
      // 规则 1：style 值必须 token: 前缀且存在于 designTokens
      for (const [k, v] of Object.entries(n.style || {})) {
        if (typeof v !== 'string') continue;
        if (!v.startsWith('token:')) errs.push({ path: `${np}.style.${k}`, rule: 'style-token', message: `样式值 "${v}" 必须以 token: 引用 designTokens` });
        else if (!tokens.has(v.slice(6))) errs.push({ path: `${np}.style.${k}`, rule: 'style-token', message: `token "${v.slice(6)}" 不存在于 designTokens` });
      }
      // 规则 2：ref 必须命中 componentRegistry
      if (n.ref && !registry.has(n.ref)) errs.push({ path: np, rule: 'ref-registry', message: `ref "${n.ref}" 不在 componentRegistry 白名单` });
    });
    (p.interactions || []).forEach((x, ii) => {
      const m = /^(tap|submit)@([A-Za-z0-9_-]+)$/.exec((x && x.trigger) || ''); if (!m) return;
      if (!reach.has(m[2])) errs.push({ path: `pages[${pi}].interactions[${ii}].trigger`, rule: 'trigger-reachable', message: `@${m[2]} 在本页 layoutTree 不可达（自动 id：tab-<tab名>、<list>-row-1..3、<dialog>-close）` });
      // 规则 4：open-page target 必须是 page id 且出现在 flowGraph.nodes
      if (x && x.action === 'open-page' && x.target) {
        if (!pageIds.has(x.target)) errs.push({ path: `pages[${pi}].interactions[${ii}].target`, rule: 'open-page-target', message: `open-page 目标 "${x.target}" 不是已定义页面` });
        else if (!flowPages.has(x.target)) errs.push({ path: `pages[${pi}].interactions[${ii}].target`, rule: 'open-page-target', message: `open-page 目标 "${x.target}" 未出现在 flowGraph.nodes` });
      }
    });
  });
}

function crossDesign(ir, errs) {
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  const ids = new Set(pages.map(p => p && p.id).filter(Boolean));
  const seen = new Set();
  pages.forEach((p, i) => {
    if (p && p.id) { if (seen.has(p.id)) errs.push({ path: `pages[${i}].id`, rule: 'page-id-unique', message: `页面 id 重复："${p.id}"` }); seen.add(p.id); }
  });
  (ir.interactions || []).forEach((x, i) => {
    if (!x) return;
    for (const k of ['from', 'to']) if (x[k] && !ids.has(x[k])) errs.push({ path: `interactions[${i}].${k}`, rule: 'interaction-endpoint', message: `${k} "${x[k]}" 未在 pages 中定义` });
  });
}

// ---------- 主流程 ----------
const argv = process.argv.slice(2);
let file = null; let kind = 'prototypeir';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--kind') {
    kind = argv[++i];
    if (!KINDS.includes(kind)) fail([{ path: '$', rule: 'cli', message: `未知 kind "${kind}"（可选：${KINDS.join(' | ')}）` }]);
  } else if (!a.startsWith('-') && file === null) file = a;
  else fail([{ path: '$', rule: 'cli', message: `无法识别的参数 ${a}` }]);
}
if (!file) fail([{ path: '$', rule: 'cli', message: '用法: node validate_ir.mjs <ir.json> [--kind prototypeir|designspec]' }]);
let ir, schema;
try { ir = JSON.parse(readFileSync(resolve(file), 'utf8')); }
catch (e) { fail([{ path: '$', rule: 'input', message: `读取/解析失败：${e.message}` }]); }
try { schema = JSON.parse(readFileSync(resolve(HERE, `../templates/${kind}.schema.json`), 'utf8')); }
catch (e) { fail([{ path: '$', rule: 'schema', message: `schema 加载失败：${e.message}` }]); }
const errs = [];
validate(ir, schema, '$', schema, errs);
if (kind === 'prototypeir') crossPrototype(ir, errs); else crossDesign(ir, errs);
if (errs.length) fail(errs);
console.log(JSON.stringify({ ok: true, kind, errors: [] }));
process.exit(0);
