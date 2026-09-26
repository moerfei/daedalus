#!/usr/bin/env node
/*
 * proto-kit scaffold_react.mjs — B 轨脚手架：PrototypeIR → React 工程
 *
 * CLI:
 *   node scaffold_react.mjs <ir.json> -o <outDir> [--template <dir>] [--no-install] [-m <fixtures.json>]
 *
 * 行为：
 *   1. 拷贝模板 templates/vite-react-shadcn → outDir
 *   2. 依 IR 确定性生成：tokens.css / App.tsx / main.tsx / routes/<pageId>/index.tsx /
 *      shell/NavBar.tsx + ShellLayout.tsx / mocks/(handlers|browser).ts / lib/fixtures.json
 *   3. 默认在 outDir 内 npm install --no-audit --no-fund（继承 stdio）；--no-install 跳过
 *
 * 成功：stdout 最后一行 {ok:true,outDir,routes,stubPages,installed}，exit 0
 * 失败：stdout {ok:false,errors:[{path,rule,message}]}，exit 1
 * 零 npm 依赖，仅 node: 内置模块；Node >= 20 ESM。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_TEMPLATE = path.resolve(__dirname, '..', 'templates', 'vite-react-shadcn')

// ---------- 参数解析 ----------

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--out') args.out = argv[++i]
    else if (a === '--template') args.template = argv[++i]
    else if (a === '-m' || a === '--fixtures') args.fixtures = argv[++i]
    else if (a === '--no-install') args.noInstall = true
    else if (a === '-h' || a === '--help') args.help = true
    else args._.push(a)
  }
  return args
}

function fail(errors) {
  process.stdout.write(JSON.stringify({ ok: false, errors }) + '\n')
  process.exit(1)
}

// ---------- 工具 ----------

function escapeJsxText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[{}]/g, (c) => `{'${c}'}`)
}

function escapeComment(s) {
  return String(s).replace(/\*\//g, '*\u204f')
}

/** TS/TSX 字符串字面量（单引号风格） */
function tsStr(s) {
  return JSON.stringify(String(s)).replace(/^"|"$/g, "'").replace(/\\"/g, '"')
}

function pageComponentName(pageId) {
  return pageId
    .split('-')
    .map((seg) => (seg ? seg[0].toUpperCase() + seg.slice(1) : ''))
    .join('')
}

/** 朴素复数化：order→orders / category→categories / box→boxes */
function plural(s) {
  if (/(s|x|z|ch|sh)$/i.test(s)) return s + 'es'
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies'
  return s + 's'
}

/** 遍历 layoutTree 全树 */
function walkTree(node, fn, ctx = {}) {
  if (!node || typeof node !== 'object') return
  fn(node, ctx)
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkTree(c, fn, ctx)
  }
}

// ---------- IR 读取与索引 ----------

function loadIr(irPath) {
  const errors = []
  let ir
  try {
    ir = JSON.parse(fs.readFileSync(irPath, 'utf8'))
  } catch (e) {
    errors.push({ path: irPath, rule: 'ir.parse', message: `IR JSON 解析失败: ${e.message}` })
    fail(errors)
  }
  if (!ir || typeof ir !== 'object') errors.push({ path: irPath, rule: 'ir.root', message: 'IR 根必须是对象' })
  if (!Array.isArray(ir.pages) || ir.pages.length === 0) errors.push({ path: 'pages', rule: 'ir.pages', message: 'pages 必须是非空数组' })
  const pageIds = new Set()
  for (const p of ir.pages || []) {
    if (!p || typeof p.id !== 'string') errors.push({ path: 'pages[]', rule: 'ir.page.id', message: '每页必须有字符串 id' })
    else if (pageIds.has(p.id)) errors.push({ path: `pages.${p.id}`, rule: 'ir.page.unique', message: `page id 重复: ${p.id}` })
    else pageIds.add(p.id)
  }
  if (errors.length) fail(errors)
  return ir
}

function findEntryPageId(ir) {
  const node = (ir.flowGraph?.nodes || []).find((n) => n && n.isEntry)
  if (node && ir.pages.some((p) => p.id === node.page)) return node.page
  return ir.pages[0].id
}

function collectNavBarProps(ir) {
  let props = null
  for (const p of ir.pages) {
    walkTree(p.layoutTree, (node) => {
      if (node.ref === 'NavBar' && props === null) props = node.props || {}
    })
  }
  return props || {}
}

// ---------- fixtures ----------

function resolveFixtures(ir, args, irPath, errors) {
  // 优先级：-m 参数 > ir 同目录 fixture.template.json > 按 dataContract 生成占位
  let fixturesPath = null
  if (args.fixtures) {
    fixturesPath = path.resolve(args.fixtures)
    if (!fs.existsSync(fixturesPath)) {
      errors.push({ path: fixturesPath, rule: 'fixtures.missing', message: '-m 指定的 fixtures 文件不存在' })
      return { fixturesPath: null, fixtures: {} }
    }
  } else {
    const sibling = path.join(path.dirname(irPath), 'fixture.template.json')
    if (fs.existsSync(sibling)) fixturesPath = sibling
  }
  if (fixturesPath) {
    try {
      return { fixturesPath, fixtures: JSON.parse(fs.readFileSync(fixturesPath, 'utf8')) }
    } catch (e) {
      errors.push({ path: fixturesPath, rule: 'fixtures.parse', message: `fixtures JSON 解析失败: ${e.message}` })
      return { fixturesPath: null, fixtures: {} }
    }
  }
  // 生成占位：每实体 3 行
  const generated = {}
  for (const entityDef of ir.dataContract || []) {
    const key = plural(String(entityDef.entity || 'item').toLowerCase())
    generated[key] = [0, 1, 2].map((i) => {
      const row = {}
      for (const [field, type] of Object.entries(entityDef.fields || {})) {
        if (field === 'id' || type === 'number') row[field] = field === 'id' ? `${entityDef.entity}-${1001 + i}` : (i + 1) * 100
        else if (field === 'status') row[field] = ['paid', 'pending', 'paid'][i]
        else row[field] = `${field}-sample-${i + 1}`
      }
      return row
    })
  }
  return { fixturesPath: null, fixtures: generated }
}

// ---------- 生成器 ----------

function genTokensCss(ir) {
  const lines = []
  lines.push('/*')
  lines.push(' * proto-kit 设计令牌 — 由 scaffold_react.mjs 依据 IR designTokens 生成')
  lines.push(` * meta.id=${ir.meta?.id ?? 'unknown'} version=${ir.meta?.version ?? '?'}（勿手改，重跑脚手架会覆写）`)
  lines.push(' * 命名契约：--<group>-<name>（与 A 轨单文件 HTML 一致）')
  lines.push(' */')
  lines.push(':root {')
  for (const [group, entries] of Object.entries(ir.designTokens || {})) {
    if (!entries || typeof entries !== 'object') continue
    for (const [name, token] of Object.entries(entries)) {
      if (!token || typeof token.$value !== 'string') continue
      lines.push(`  --${group}-${name}: ${token.$value};`)
    }
  }
  lines.push('}')
  return lines.join('\n') + '\n'
}

function genMainTsx() {
  return `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// proto-kit 入口（scaffold_react.mjs 生成）：DEV 模式启用 MSW mock，HashRouter 见 App.tsx
async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
`
}

function genAppTsx(ir, entryPageId, shellUsed) {
  const importLines = [`import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'`]
  if (shellUsed) importLines.push(`import ShellLayout from './shell/ShellLayout'`)
  for (const p of ir.pages) importLines.push(`import ${pageComponentName(p.id)} from './routes/${p.id}'`)

  const routeLines = []
  routeLines.push(`        <Route path="/" element={<Navigate to="/${entryPageId}" replace />} />`)
  let inShell = false
  for (const p of ir.pages) {
    const wantsShell = p.usesShell === 'default' && shellUsed
    if (wantsShell && !inShell) {
      routeLines.push(`        <Route element={<ShellLayout />}>`)
      inShell = true
    } else if (!wantsShell && inShell) {
      routeLines.push(`        </Route>`)
      inShell = false
    }
    routeLines.push(`        <Route path="/${p.id}" element={<${pageComponentName(p.id)} />} />`)
  }
  if (inShell) routeLines.push(`        </Route>`)

  return `/*
 * proto-kit App — 由 scaffold_react.mjs 生成
 * meta.id=${ir.meta?.id ?? 'unknown'} version=${ir.meta?.version ?? '?'}
 * 路由：HashRouter，工程内路径 /<pageId>；入口页 ${entryPageId}（flowGraph.isEntry）。
 * hash 直达形如 #${entryPageId}（HashRouter 会归一化为 /${entryPageId}，与 A 轨 hash 契约一致）。
 */
${importLines.join('\n')}

export default function App() {
  return (
    <HashRouter>
      <Routes>
${routeLines.join('\n')}
      </Routes>
    </HashRouter>
  )
}
`
}

function genPageStub(p, shellUsed) {
  const wantsShell = p.usesShell === 'default' && shellUsed
  const wrapper = wantsShell
    ? '<main className="w-full space-y-3 py-2 text-foreground">'
    : '<main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-foreground">'
  const closer = wantsShell ? '</main>' : '</main>'
  return `/*
 * proto-kit page stub — scaffold_react.mjs 生成
 * pageId: ${p.id}
 * route: ${p.route ?? '/'}（IR route 字段；工程内实际路径 /${p.id}）
 * title: ${escapeComment(p.title ?? p.id)}
 * intent: ${escapeComment(p.intent ?? '')}
 * usesShell: ${p.usesShell ?? 'none'}
 */
// PAGEGEN-TODO: 依据 PageSpec 填充布局与交互
export default function ${pageComponentName(p.id)}() {
  return (
    ${wrapper}
      <h1 className="text-2xl font-bold">${escapeJsxText(p.title ?? p.id)}</h1>
      <p className="text-sm text-muted">PAGEGEN-TODO：脚手架占位页，请依据 PageSpec 填充布局与交互。</p>
    ${closer}
  )
}
`
}

function genNavBarTsx(ir, entryPageId) {
  const navProps = collectNavBarProps(ir)
  const title = typeof navProps.title === 'string' && navProps.title ? navProps.title : ir.meta?.name || 'Proto App'
  const user = typeof navProps.user === 'string' && navProps.user ? navProps.user : 'user'
  return `/*
 * proto-kit shell NavBar — scaffold_react.mjs 生成
 * 用途：usesShell=default 的页面共用顶栏；退出按钮 id=logout-btn（交互契约与 A 轨一致）。
 */
import { useNavigate } from 'react-router-dom'

export interface NavBarProps {
  title?: string
  user?: string
  onLogout?: () => void
}

export default function NavBar({ title = ${tsStr(title)}, user = ${tsStr(user)}, onLogout }: NavBarProps) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div className="text-base font-semibold text-foreground">{title}</div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">{user}</span>
        <button
          id="logout-btn"
          type="button"
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors hover:bg-muted/10"
          onClick={onLogout ?? (() => navigate('/${entryPageId}'))}
        >
          退出
        </button>
      </div>
    </header>
  )
}
`
}

function genShellLayoutTsx(ir) {
  const navProps = collectNavBarProps(ir)
  const title = typeof navProps.title === 'string' && navProps.title ? navProps.title : ir.meta?.name || 'Proto App'
  const user = typeof navProps.user === 'string' && navProps.user ? navProps.user : 'user'
  return `/*
 * proto-kit shell 布局 — scaffold_react.mjs 生成
 * usesShell=default 的页面嵌套在此布局：顶栏 NavBar + <Outlet /> 内容容器。
 */
import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'

export default function ShellLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <NavBar title=${tsStr(title)} user=${tsStr(user)} />
      <main className="flex-1 px-6 py-4">
        <Outlet />
      </main>
    </div>
  )
}
`
}

function genHandlersTsx(ir, fixtures) {
  const lines = []
  lines.push('/*')
  lines.push(' * proto-kit MSW handlers — scaffold_react.mjs 生成（dataContract + fixtures）')
  lines.push(` * meta.id=${ir.meta?.id ?? 'unknown'} version=${ir.meta?.version ?? '?'}（勿手改，重跑脚手架会覆写）`)
  lines.push(' */')
  lines.push("import { http, HttpResponse } from 'msw'")
  lines.push("import rawFixtures from '../lib/fixtures.json'")
  lines.push('')
  lines.push('const fixtures = rawFixtures as Record<string, unknown>')
  lines.push('const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])')
  lines.push('')
  lines.push('export const handlers = [')
  for (const entityDef of ir.dataContract || []) {
    const entity = String(entityDef.entity || 'item')
    const lower = entity.toLowerCase()
    const pluralKey = plural(lower)
    const candidates = [pluralKey, lower, entity]
    const key = candidates.find((k) => Object.prototype.hasOwnProperty.call(fixtures, k)) ?? pluralKey
    lines.push(`  // GET /api/${pluralKey} ← entity ${entity}（fixtures.${key}）`)
    lines.push(`  http.get('/api/${pluralKey}', () => HttpResponse.json(asArray(fixtures[${tsStr(key)}]))),`)
  }
  if (!ir.dataContract || ir.dataContract.length === 0) {
    lines.push('  // IR 未定义 dataContract，无自动端点')
  }
  lines.push(']')
  return lines.join('\n') + '\n'
}

function genBrowserTsx() {
  return `import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// proto-kit MSW browser worker — scaffold_react.mjs 生成
export const worker = setupWorker(...handlers)
`
}

// ---------- 主流程 ----------

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args._.length === 0 || !args.out) {
    process.stdout.write(
      '用法: node scaffold_react.mjs <ir.json> -o <outDir> [--template <dir>] [--no-install] [-m <fixtures.json>]\n',
    )
    process.exit(args.help ? 0 : 1)
  }

  const errors = []
  const irPath = path.resolve(args._[0])
  if (!fs.existsSync(irPath)) fail([{ path: irPath, rule: 'ir.missing', message: 'IR 文件不存在' }])
  const outDir = path.resolve(args.out)
  const templateDir = path.resolve(args.template || DEFAULT_TEMPLATE)
  if (!fs.existsSync(templateDir)) {
    fail([{ path: templateDir, rule: 'template.missing', message: '模板目录不存在（--template）' }])
  }
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir).filter((f) => f !== '.DS_Store')
    if (entries.length > 0) {
      fail([{ path: outDir, rule: 'outDir.notEmpty', message: 'outDir 已存在且非空，拒绝覆写' }])
    }
  }

  const ir = loadIr(irPath)
  const entryPageId = findEntryPageId(ir)
  const { fixtures } = resolveFixtures(ir, args, irPath, errors)
  if (errors.length) fail(errors)

  // 1. 拷贝模板
  fs.mkdirSync(outDir, { recursive: true })
  fs.cpSync(templateDir, outDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src)
      return base !== 'node_modules' && base !== 'dist' && base !== '.git'
    },
  })

  // 2. 生成文件
  const shellUsed = ir.pages.some((p) => p.usesShell === 'default')
  const routes = ir.pages.map((p) => `/${p.id}`)
  const stubPages = ir.pages.map((p) => p.id)

  fs.writeFileSync(path.join(outDir, 'src', 'tokens.css'), genTokensCss(ir))
  fs.writeFileSync(path.join(outDir, 'src', 'App.tsx'), genAppTsx(ir, entryPageId, shellUsed))
  fs.writeFileSync(path.join(outDir, 'src', 'main.tsx'), genMainTsx())
  for (const p of ir.pages) {
    const pageDir = path.join(outDir, 'src', 'routes', p.id)
    fs.mkdirSync(pageDir, { recursive: true })
    fs.writeFileSync(path.join(pageDir, 'index.tsx'), genPageStub(p, shellUsed))
  }
  if (shellUsed) {
    fs.mkdirSync(path.join(outDir, 'src', 'shell'), { recursive: true })
    fs.writeFileSync(path.join(outDir, 'src', 'shell', 'NavBar.tsx'), genNavBarTsx(ir, entryPageId))
    fs.writeFileSync(path.join(outDir, 'src', 'shell', 'ShellLayout.tsx'), genShellLayoutTsx(ir))
  }
  fs.mkdirSync(path.join(outDir, 'src', 'mocks'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'src', 'mocks', 'handlers.ts'), genHandlersTsx(ir, fixtures))
  fs.writeFileSync(path.join(outDir, 'src', 'mocks', 'browser.ts'), genBrowserTsx())
  fs.mkdirSync(path.join(outDir, 'src', 'lib'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'src', 'lib', 'fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n')

  // 3. 安装
  let installed = false
  if (!args.noInstall) {
    const res = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: outDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (res.status !== 0) {
      fail([{ path: outDir, rule: 'npm.install', message: `npm install 失败（exit ${res.status}）` }])
    }
    installed = true
  }

  process.stdout.write(
    JSON.stringify({ ok: true, outDir, entry: `/${entryPageId}`, routes, stubPages, installed }) + '\n',
  )
}

main()
