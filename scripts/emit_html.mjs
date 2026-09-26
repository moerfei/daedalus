#!/usr/bin/env node
// emit_html.mjs — PrototypeIR → A 轨单文件 HTML 发射器（零依赖，Node≥20 ESM）
// 用法：node emit_html.mjs <ir.json> -o <out.html> [-m fixtures.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function fail(errors) { console.log(JSON.stringify({ ok: false, errors })); process.exit(1); }

function parseArgs(argv) {
  const p = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') p.out = argv[++i];
    else if (a === '-m' || a === '--fixtures') p.fixtures = argv[++i];
    else if (a === '-h' || a === '--help') p.help = true;
    else if (a.startsWith('-') && a.length > 1) fail([{ path: '$', rule: 'cli', message: `未知参数 ${a}` }]);
    else p._.push(a);
  }
  return p;
}

// ---------- 转义 ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');
const escSq = s => esc(s).replace(/'/g, '&#39;'); // data-proto-chain 用单引号包裹

// ---------- tokens → CSS 变量 ----------
function tokenCss(tokens) {
  let s = ':root{';
  for (const [g, grp] of Object.entries(tokens || {}))
    for (const [n, t] of Object.entries(grp || {})) {
      const v = t && t.$value != null ? String(t.$value) : '';
      s += `--${g}-${n}:${v.replace(/[<>{}]/g, '')};`;
    }
  return s + '}';
}

// style: token:g.n → CSS 变量引用；font+typography token 展开为 font-size/line-height/font-weight
function styleAttr(node, ir) {
  const st = node && node.style; if (!st) return '';
  const tokens = ir.designTokens || {};
  let out = '';
  for (const [k, v] of Object.entries(st)) {
    if (typeof v !== 'string' || !v) continue;
    if (v.startsWith('token:')) {
      const key = v.slice(6); const dot = key.indexOf('.');
      const g = key.slice(0, dot); const n = key.slice(dot + 1);
      const tk = tokens[g] && tokens[g][n];
      if (k === 'font' && tk && tk.$type === 'typography' && /^[^/]+\/[^/]+\/[^/]+$/.test(String(tk.$value))) {
        const [fs, lh, fw] = String(tk.$value).split('/');
        out += `font-size:${fs};line-height:${lh};font-weight:${fw};`;
      } else out += `${k}:var(--${key.replace(/\./g, '-')});`;
    } else out += `${k}:${v};`; // 非 token 值原样透传（validate_ir 负责拦截）
  }
  return out ? ` style="${escAttr(out)}"` : '';
}

// 状态条件显隐约定：node.props.if = "key=value" → data-proto-if（runtime 初始化与 set-state 后求值）
const ifAttr = n => (n.props && typeof n.props.if === 'string' && n.props.if.includes('=') ? ` data-proto-if="${escAttr(n.props.if)}"` : '');

// ---------- 交互挂载：interactions → 元素 chain / form 合并链 ----------
function buildMounts(page) {
  const inter = Array.isArray(page.interactions) ? page.interactions : [];
  const formsInfo = [];
  (function w(n, cur) {
    if (!n || typeof n !== 'object') return;
    let f = cur;
    if (n.type === 'form' && n.id) { f = { id: n.id, buttons: [] }; formsInfo.push(f); }
    if (n.type === 'button' && n.id && f) f.buttons.push(n.id);
    (n.children || []).forEach(c => w(c, f));
  })(page.layoutTree, null);
  const tapCount = {}; const hasSubmit = {};
  for (const x of inter) {
    const m = /^(tap|submit)@([A-Za-z0-9_-]+)$/.exec((x && x.trigger) || ''); if (!m) continue;
    if (m[1] === 'tap') tapCount[m[2]] = (tapCount[m[2]] || 0) + 1; else hasSubmit[m[2]] = true;
  }
  // form 内带 tap 的按钮即 submit 按钮；若 form 有 submit@ 交互却无任何按钮带 tap，则最后一个按钮兜底为 submit
  const submitSet = new Set();
  for (const f of formsInfo) {
    f.buttons.forEach(b => { if (tapCount[b]) submitSet.add(b); });
    if (!f.buttons.some(b => submitSet.has(b)) && hasSubmit[f.id] && f.buttons.length) submitSet.add(f.buttons[f.buttons.length - 1]);
  }
  const item = x => { const o = { action: x.action }; if (x.target != null) o.target = x.target; if (x.state != null) o.state = x.state; return o; };
  const elChain = {}; const formChain = {};
  for (const x of inter) { // 按 IR 顺序合并
    const m = /^(tap|submit)@([A-Za-z0-9_-]+)$/.exec((x && x.trigger) || ''); if (!m) continue;
    if (m[1] === 'submit') { (formChain[m[2]] = formChain[m[2]] || []).push(item(x)); continue; }
    if (submitSet.has(m[2])) {
      const f = formsInfo.find(g => g.buttons.includes(m[2]));
      if (f) { (formChain[f.id] = formChain[f.id] || []).push(item(x)); continue; } // 合并进 form 链，按钮不单独挂
    }
    (elChain[m[2]] = elChain[m[2]] || []).push(item(x));
  }
  return { elChain, formChain, submitSet };
}

// ---------- layoutTree → HTML ----------
const idAttr = n => (n.id ? ` id="${escAttr(n.id)}"` : '');
const refClass = n => (n.ref ? ` pk-${n.ref.toLowerCase()}` : '');
const clsAttr = (...cs) => { const c = cs.filter(Boolean).join(' ').trim(); return c ? ` class="${c}"` : ''; };

function chainAttr(id, ctx) {
  const c = ctx.elChain[id]; if (!c) return '';
  ctx.mounted.add(id);
  return ` data-proto-chain='${escSq(JSON.stringify(c))}'`;
}

function renderTabs(n, ctx, style) {
  const kids = n.children || [];
  const panels = kids.filter(c => c && c.props && c.props.tab != null);
  const others = kids.filter(c => !(c && c.props && c.props.tab != null));
  const bar = panels.map((c, i) => {
    const t = String(c.props.tab); const on = i === 0;
    return `<button id="tab-${escAttr(t)}" type="button" role="tab" class="pk-tab${on ? ' pk-active' : ''}" data-proto-tab="${escAttr(t)}" aria-selected="${on}"${chainAttr('tab-' + t, ctx)}>${esc(c.props.label != null ? String(c.props.label) : t)}</button>`;
  }).join('');
  const body = panels.map((c, i) => {
    const t = String(c.props.tab); const on = i === 0;
    return `<div${c.id ? ` id="${escAttr(c.id)}"` : ''} data-proto-panel="${escAttr(t)}" class="pk-panel${on ? ' pk-active' : ''}" role="tabpanel">${(c.children || []).map(g => renderNode(g, ctx)).join('')}</div>`;
  }).join('');
  return `<div${idAttr(n)}${clsAttr('pk-tabs')}${style}><div class="pk-tabs-bar" role="tablist">${bar}</div>${body}${others.map(c => renderNode(c, ctx)).join('')}</div>`;
}

function renderDialog(n, ctx, style) {
  const closeId = `${n.id || 'dialog'}-close`;
  const title = (n.props && n.props.title) || '';
  return `<div${idAttr(n)}${clsAttr('pk-modal')}${style}><div class="pk-modal-card" role="dialog" aria-modal="true"><div class="pk-modal-head"><span class="pk-modal-title">${esc(title)}</span><button id="${escAttr(closeId)}" type="button" class="pk-modal-close" aria-label="关闭"${chainAttr(closeId, ctx)}>&times;</button></div>${(n.children || []).map(c => renderNode(c, ctx)).join('')}</div></div>`;
}

function renderNavBar(n, ctx, style) {
  const pr = n.props || {};
  return `<nav${idAttr(n)}${clsAttr('pk-navbar')}${style}><span class="pk-navbar-title">${esc(pr.title || '')}</span><span class="pk-navbar-user">${esc(pr.user || '')}</span>${(n.children || []).map(c => renderNode(c, ctx)).join('')}</nav>`;
}

function renderList(n, ctx, style) {
  const filter = (n.props && n.props.filter) || '';
  let rows = null;
  const data = n.binding != null ? ctx.fixtures[n.binding] : undefined;
  if (Array.isArray(data)) {
    const m = /^([^=]+)=(.*)$/.exec(filter);
    rows = (m && m[2] !== 'all') ? data.filter(r => r && String(r[m[1]]) === m[2]) : data.slice();
  }
  const count = rows ? rows.length : 3; // 无 fixtures/binding → 3 行占位
  let body = '';
  for (let i = 1; i <= count; i++) {
    const rowId = `${n.id || 'list'}-row-${i}`;
    const cells = rows
      ? Object.entries(rows[i - 1] || {}).map(([k, v]) => `<span class="pk-cell" title="${escAttr(k)}">${typeof v === 'number' ? '&yen;' + v : esc(String(v))}</span>`).join('')
      : `<span class="pk-cell">占位数据 ${i}</span>`;
    body += `<div id="${escAttr(rowId)}" class="pk-list-row"${chainAttr(rowId, ctx)}>${cells || '<span class="pk-cell">-</span>'}</div>`;
  }
  return `<div${idAttr(n)}${clsAttr('pk-list')}${style}>${body}</div>`;
}

function renderNode(n, ctx) {
  if (!n || typeof n !== 'object') return '';
  const style = styleAttr(n, ctx.ir) + ifAttr(n); // style 与 data-proto-if 一并透传给各分支/子渲染器
  const kids = () => (n.children || []).map(c => renderNode(c, ctx)).join('');
  switch (n.type) {
    case 'section':
      return `<div${idAttr(n)}${clsAttr(refClass(n).trim())}${style}>${n.text != null ? `<div class="pk-text">${esc(n.text)}</div>` : ''}${kids()}</div>`;
    case 'component': {
      const ref = n.ref || '';
      if (ref === 'Tabs') return renderTabs(n, ctx, style);
      if (ref === 'Dialog') return renderDialog(n, ctx, style);
      if (ref === 'NavBar') return renderNavBar(n, ctx, style);
      const label = n.text != null ? n.text : (n.props && n.props.text != null ? n.props.text : '');
      return `<div${idAttr(n)}${clsAttr(refClass(n).trim())}${style}>${label !== '' ? esc(label) : ''}${kids()}</div>`;
    }
    case 'text':
      return `<div${idAttr(n)}${clsAttr('pk-text', refClass(n).trim())}${style}>${esc(n.text || '')}</div>`;
    case 'image': {
      const src = (n.props && n.props.src) || `https://picsum.photos/seed/${n.id || 'pk-img'}/400/240`;
      return `<img${idAttr(n)}${clsAttr('pk-image', refClass(n).trim())}${style} src="${escAttr(src)}" alt="${escAttr((n.props && n.props.alt) || n.text || '')}">`;
    }
    case 'button': {
      const variant = n.props && n.props.variant ? String(n.props.variant).replace(/[^a-z0-9_-]/gi, '') : '';
      const type = (n.id && ctx.submitSet.has(n.id)) ? 'submit' : 'button';
      const text = ((n.props && n.props.text != null ? n.props.text : n.text) || '');
      const chain = type === 'submit' ? '' : (n.id ? chainAttr(n.id, ctx) : ''); // submit 按钮链已合并进 form
      return `<button${idAttr(n)} type="${type}"${clsAttr('pk-button', variant && `pk-button-${variant}`)}${style}${chain}>${esc(text)}</button>`;
    }
    case 'input': {
      const pr = n.props || {};
      return `<input${idAttr(n)}${n.id ? ` name="${escAttr(n.id)}"` : ''}${clsAttr('pk-input', refClass(n).trim())}${style} type="${escAttr(pr.type || 'text')}"${pr.placeholder ? ` placeholder="${escAttr(pr.placeholder)}"` : ''}${pr.required ? ' required' : ''}>`;
    }
    case 'form': {
      const c = n.id ? ctx.formChain[n.id] : null;
      if (n.id && c) ctx.mounted.add(n.id);
      return `<form${idAttr(n)}${clsAttr('pk-form', refClass(n).trim())}${style} novalidate${c ? ` data-proto-chain='${escSq(JSON.stringify(c))}'` : ''}>${kids()}</form>`;
    }
    case 'list':
      return renderList(n, ctx, style);
    default:
      return `<div${idAttr(n)}${style}>${kids()}</div>`;
  }
}

// ---------- pk-* 基础样式（浅色主题，观感整洁） ----------
const BASE_CSS = `*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:var(--color-text,#0f172a);background:var(--color-bg,#f8fafc)}
.pk-page{display:none;min-height:100vh;max-width:960px;margin:0 auto;padding:24px}
.pk-page.pk-active{display:block}
.pk-page>.pk-card{max-width:400px;margin:9vh auto 0}
.pk-text{margin:0 0 12px}
.pk-card{background:var(--color-surface,#fff);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,12px);padding:28px;box-shadow:0 1px 3px rgba(15,23,42,.06)}
.pk-form{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.pk-input{padding:9px 12px;border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,8px);font:inherit;color:inherit;background:#fff}
.pk-input:focus{outline:2px solid var(--color-primary,#2563eb);outline-offset:1px;border-color:transparent}
.pk-button{padding:9px 16px;border:0;border-radius:var(--radius-md,8px);font:inherit;font-weight:600;cursor:pointer;background:#e2e8f0;color:var(--color-text,#0f172a)}
.pk-button:hover{filter:brightness(.96)}
.pk-button-primary{background:var(--color-primary,#2563eb);color:#fff}
.pk-button-danger{background:var(--color-danger,#dc2626);color:#fff}
.pk-button-ghost{background:transparent;color:var(--color-muted,#64748b);border:1px solid var(--color-border,#e2e8f0)}
.pk-navbar{display:flex;align-items:center;gap:12px;padding:14px 20px;background:var(--color-surface,#fff);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,12px);margin-bottom:20px}
.pk-navbar-title{font-weight:700;font-size:16px}
.pk-navbar-user{margin-left:auto;color:var(--color-muted,#64748b)}
.pk-tabs-bar{display:flex;gap:8px;border-bottom:1px solid var(--color-border,#e2e8f0);margin-bottom:16px}
.pk-tab{padding:8px 16px;border:0;border-bottom:2px solid transparent;background:transparent;font:inherit;font-weight:500;color:var(--color-muted,#64748b);cursor:pointer;border-radius:6px 6px 0 0}
.pk-tab.pk-active{color:var(--color-primary,#2563eb);border-bottom-color:var(--color-primary,#2563eb)}
.pk-panel{display:none}
.pk-panel.pk-active{display:block}
.pk-list{display:flex;flex-direction:column;gap:10px}
.pk-list-row{display:flex;flex-wrap:wrap;gap:8px 24px;padding:12px 16px;background:var(--color-surface,#fff);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,8px)}
.pk-list-row:hover{border-color:var(--color-primary,#2563eb)}
.pk-cell{color:var(--color-text,#0f172a)}
.pk-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;background:#e0e7ff;color:#3730a3}
.pk-modal{display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50;align-items:center;justify-content:center}
.pk-modal.pk-open{display:flex}
.pk-modal-card{background:var(--color-surface,#fff);border-radius:var(--radius-lg,12px);padding:20px 24px;min-width:320px;max-width:520px;box-shadow:0 10px 30px rgba(15,23,42,.2)}
.pk-modal-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}
.pk-modal-title{font-weight:700;font-size:16px}
.pk-modal-close{border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:var(--color-muted,#64748b);padding:4px 8px;border-radius:6px}
.pk-modal-close:hover{background:#f1f5f9;color:var(--color-text,#0f172a)}
.pk-toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:var(--color-text,#0f172a);color:#fff;padding:10px 18px;border-radius:var(--radius-md,8px);z-index:99;box-shadow:0 6px 20px rgba(15,23,42,.25)}
.pk-toast-error{background:var(--color-danger,#dc2626)}`;

// ---------- 主流程 ----------
function main() {
  const p = parseArgs(process.argv.slice(2));
  if (p.help || p._.length !== 1 || !p.out) fail([{ path: '$', rule: 'cli', message: '用法: node emit_html.mjs <ir.json> -o <out.html> [-m fixtures.json]' }]);
  let ir;
  try { ir = JSON.parse(readFileSync(resolve(p._[0]), 'utf8')); }
  catch (e) { fail([{ path: '$', rule: 'input', message: `IR 读取/解析失败：${e.message}` }]); }
  const errors = [];
  if (!ir || typeof ir !== 'object' || !Array.isArray(ir.pages) || ir.pages.length === 0) errors.push({ path: 'pages', rule: 'structure', message: 'pages 必须为非空数组，无法发射' });
  else ir.pages.forEach((pg, i) => {
    if (!pg || typeof pg !== 'object' || !pg.id) errors.push({ path: `pages[${i}]`, rule: 'structure', message: '页面缺少 id，无法发射' });
    if (!pg.layoutTree || typeof pg.layoutTree !== 'object') errors.push({ path: `pages[${i}].layoutTree`, rule: 'structure', message: '页面缺少 layoutTree，无法发射' });
  });
  let runtime;
  try { runtime = readFileSync(resolve(HERE, '../templates/runtime/proto-runtime.js'), 'utf8'); }
  catch (e) { errors.push({ path: 'runtime', rule: 'runtime', message: `无法读取 templates/runtime/proto-runtime.js：${e.message}` }); }
  if (errors.length) fail(errors);

  let fixtures = {};
  if (p.fixtures) {
    try { fixtures = JSON.parse(readFileSync(resolve(p.fixtures), 'utf8')); }
    catch (e) { fail([{ path: 'fixtures', rule: 'input', message: `fixtures 读取/解析失败：${e.message}` }]); }
  }

  const warnings = [];
  const flowNodes = (ir.flowGraph && Array.isArray(ir.flowGraph.nodes)) ? ir.flowGraph.nodes : [];
  let entry = (flowNodes.find(n => n && n.isEntry && n.page) || {}).page || '';
  if (!entry) { entry = ir.pages[0].id; if (flowNodes.length) warnings.push(`flowGraph 无 isEntry 节点，回退首页 ${entry} 作为入口`); }
  if (!ir.pages.some(pg => pg.id === entry)) { warnings.push(`入口 ${entry} 不在 pages 中，回退 ${ir.pages[0].id}`); entry = ir.pages[0].id; }

  const pagesHtml = ir.pages.map(pg => {
    const mounts = buildMounts(pg);
    const ctx = { ir, fixtures, elChain: mounts.elChain, formChain: mounts.formChain, submitSet: mounts.submitSet, mounted: new Set() };
    const inner = renderNode(pg.layoutTree, ctx);
    for (const id of Object.keys(ctx.elChain)) if (!ctx.mounted.has(id)) warnings.push(`页面 ${pg.id}：tap@${id} 的目标元素未在产物中找到，未挂载`);
    for (const id of Object.keys(ctx.formChain)) if (!ctx.mounted.has(id)) warnings.push(`页面 ${pg.id}：submit@${id} 的目标 form 未在产物中找到，未挂载`);
    return `<section class="pk-page" id="page-${escAttr(pg.id)}" data-proto-page="${escAttr(pg.id)}">${inner}</section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc((ir.meta && ir.meta.name) || 'Prototype')}</title>
<style>
${tokenCss(ir.designTokens)}
${BASE_CSS}
</style>
</head>
<body data-proto-entry="${escAttr(entry)}">
${pagesHtml}
<script id="pk-fixtures" type="application/json">${JSON.stringify(fixtures).replace(/</g, '\\u003c')}</script>
<script>
${runtime}
</script>
</body>
</html>`;

  const outPath = resolve(p.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  console.log(JSON.stringify({ ok: true, out: outPath, bytes: Buffer.byteLength(html), pages: ir.pages.map(x => x.id), warnings }));
}

try { main(); } catch (e) { fail([{ path: '$', rule: 'internal', message: e.message }]); }
