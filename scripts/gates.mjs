#!/usr/bin/env node
/*
 * proto-kit gates.mjs — G0/G2/G3 质量门禁（Playwright/Chromium）
 *
 * CLI:
 *   node gates.mjs --ir <ir.json> (--serve <dir|file.html> [--port 8787] | --url <http://...>) [--out <reportDir>]
 *
 * 检查项：
 *   G0  每页 pageerror=0、console.error=0（哨兵在导航前挂好）
 *   G3  IR interactions 逐条断言（A 轨 ID/属性契约：tab-<名> / [data-proto-panel] .pk-active /
 *       <dialogId>-close / [data-proto-toast] / hash=#<pageId> / form submit 合并契约）
 *   死链 open-page 目标必须是存在 pageId；open-modal 目标选择器必须在所属页 DOM 存在
 *   G2  每页 1280x800 截图 → <reportDir>/screenshots/<pageId>.png
 *
 * 输出 <reportDir>/gates-report.json；硬门禁（G0+G3+死链）全过 exit 0，否则 exit 1；
 * playwright 缺失 exit 2（附安装指引）。零 npm 依赖（playwright 除外），Node >= 20 ESM。
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const WAIT = 3000 // 单步等待下限（>=2s，防 flake）

// ---------- 参数 ----------

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ir') args.ir = argv[++i]
    else if (a === '--serve') args.serve = argv[++i]
    else if (a === '--url') args.url = argv[++i]
    else if (a === '--port') args.port = Number(argv[++i])
    else if (a === '--out') args.out = argv[++i]
    else if (a === '-h' || a === '--help') args.help = true
    else { console.error(`未知参数: ${a}`); process.exit(1) }
  }
  return args
}

function usage() {
  console.error(
    '用法: node gates.mjs --ir <ir.json> (--serve <dir|file.html> [--port 8787] | --url <http://...>) [--out <reportDir>]',
  )
}

// ---------- 工具 ----------

function idSel(id) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) ? `#${id}` : `[id="${id}"]`
}

function toPosix(p) {
  return p.split(path.sep).join('/')
}

// ---------- playwright 解析（mission 契约顺序） ----------

const PW_LOCAL_DIR = () =>
  path.join(os.homedir(), '.zcode', 'cli', 'plugins', 'data', 'proto-kit@local-plugins', 'node_modules', 'playwright')

async function loadPlaywright() {
  // 1) 常规 import('playwright')
  try {
    const m = await import('playwright')
    const pw = m.default && m.default.chromium ? m.default : m
    if (pw && pw.chromium) return { pw, path: 'playwright' }
  } catch { /* 落到下一级 */ }
  // 2) proto-kit 本地数据目录安装位
  const dir = PW_LOCAL_DIR()
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    try {
      const req = createRequire(path.join(dir, 'noop.js'))
      const pw = req(dir)
      if (pw && pw.chromium) return { pw, path: dir }
    } catch { /* 落到指引 */ }
  }
  return null
}

function playwrightMissingHint() {
  return [
    '未找到 playwright。两种修复方式：',
    '  1) node env_doctor.mjs --fix   （proto-kit 官方路径，安装到 ' + PW_LOCAL_DIR() + '）',
    '  2) 在任意上级目录 npm i playwright 并执行 npx playwright install chromium',
    '网络不畅时可设镜像: PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/',
  ]
}

// ---------- 静态服务（--serve） ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

/** 返回 { server, port, entryFile }；file.html → serve 其所在目录且 / 重定向到该文件 */
function createStaticServer(rootDir, entryFile, startPort) {
  const root = path.resolve(rootDir)
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
      if (urlPath === '/' && entryFile) {
        res.writeHead(302, { Location: '/' + entryFile.split('/').pop() })
        res.end()
        return
      }
      let filePath = path.resolve(root, '.' + urlPath)
      if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      let st = await fs.promises.stat(filePath).catch(() => null)
      if (st && st.isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        st = await fs.promises.stat(filePath).catch(() => null)
      }
      if (!st || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('404: ' + urlPath)
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      const body = await fs.promises.readFile(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      })
      res.end(body)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e && e.message))
    }
  })
  return { server, root, entryFile, startPort }
}

function listenWithFallback(server, startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort
    const tryListen = () => {
      server.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && port < startPort + 20) {
          port++
          tryListen()
        } else reject(e)
      })
      server.listen(port, '127.0.0.1')
    }
    server.once('listening', () => resolve(port))
    tryListen()
  })
}

// ---------- IR 索引（A 轨 ID/属性契约） ----------

function buildIndex(ir) {
  const byId = new Map()
  const formButtons = new Map()
  for (const p of ir.pages) {
    const walk = (node, tabName, formId) => {
      if (!node || typeof node !== 'object') return
      const myForm = node.type === 'form' ? node.id || formId : formId
      if (node.id) {
        byId.set(node.id, { pageId: p.id, tabName })
        if (node.type === 'button' && myForm) formButtons.set(node.id, myForm)
        if (node.ref === 'Dialog') byId.set(`${node.id}-close`, { pageId: p.id, tabName })
        if (node.type === 'list') {
          for (let n = 1; n <= 8; n++) byId.set(`${node.id}-row-${n}`, { pageId: p.id, tabName })
        }
      }
      if (node.ref === 'Tabs') {
        for (const c of node.children || []) {
          if (c && typeof c === 'object' && c.type === 'section' && c.props && c.props.tab != null) {
            const t = String(c.props.tab)
            if (c.id) byId.set(c.id, { pageId: p.id, tabName: t, isPanel: true })
            for (const cc of c.children || []) walk(cc, t, myForm)
            byId.set(`tab-${t}`, { pageId: p.id, tabName: null, isTabButton: true })
          } else {
            walk(c, tabName, myForm)
          }
        }
        return
      }
      for (const c of node.children || []) walk(c, tabName, myForm)
    }
    walk(p.layoutTree, null, null)
  }
  return { byId, formButtons }
}

function parseTrigger(trigger) {
  const m = /^(tap|submit)@([A-Za-z0-9_-]+)$/.exec(String(trigger || ''))
  return m ? { kind: m[1], id: m[2] } : null
}

// ---------- G3 执行 ----------

async function currentHash(page) {
  // A 轨 hash 形如 #p-x，B 轨 HashRouter 归一化为 #/p-x —— 统一剥掉 # 与前导 / 再比较
  return page.evaluate(() => location.hash.replace(/^#\/?/, ''))
}

async function ensureReady(page, index, elId, currentPageId, urlMode) {
  const info = index.byId.get(elId)
  const wantPage = (info && info.pageId) || currentPageId
  const cur = await currentHash(page)
  if (cur !== wantPage) {
    await page.evaluate((h) => { location.hash = h }, (urlMode ? '#/' : '#') + wantPage)
    await page.waitForTimeout(250)
  }
  // 元素处于非激活 tab 面板时，先激活该 tab（幂等）
  if (info && info.tabName) {
    const tabSel = idSel('tab-' + info.tabName)
    try {
      await page.waitForSelector(tabSel, { timeout: 1500 })
      await page.click(tabSel)
      await page.waitForTimeout(150)
    } catch { /* 容忍：交由后续断言报错 */ }
  }
}

async function fillRequired(page, formId) {
  const formSel = idSel(formId)
  await page.waitForSelector(formSel, { timeout: WAIT })
  const reqs = page.locator(formSel).locator('[required]')
  const n = await reqs.count()
  for (let i = 0; i < n; i++) {
    await reqs.nth(i).fill('proto-gates-fill')
  }
}

async function waitHash(page, target) {
  const want = String(target).replace(/^\//, '')
  const deadline = Date.now() + WAIT
  let last = ''
  while (Date.now() < deadline) {
    last = await page.evaluate(() => location.hash.replace(/^#\/?/, ''))
    if (last === want) return last
    await page.waitForTimeout(100)
  }
  throw new Error(`hash 未变为 ${want}（当前 ${last}）`)
}

async function execInteraction(page, currentPageId, inter, index, urlMode) {
  const trig = parseTrigger(inter.trigger)
  if (!trig) return { pass: false, detail: `trigger 无法解析: ${inter.trigger}` }
  if (inter.action === 'set-state') {
    return { pass: true, detail: `set-state（${inter.state || ''}）无 DOM 断言，按契约直接通过` }
  }
  const formId = trig.kind === 'submit' ? trig.id : index.formButtons.get(trig.id)
  try {
    await ensureReady(page, index, trig.id, currentPageId, urlMode)
    // 合并契约：form 内 submit 按钮的 tap = form submit 语义 → 先填齐 required 再点击
    if (formId) await fillRequired(page, formId)
    const clickSel = trig.kind === 'submit' ? `${idSel(formId)} button[type=submit]` : idSel(trig.id)
    await page.waitForSelector(clickSel, { timeout: WAIT })
    await page.click(clickSel)

    switch (inter.action) {
      case 'open-page': {
        const h = await waitHash(page, inter.target)
        return { pass: true, detail: `click 后 location.hash=${h}` }
      }
      case 'open-modal': {
        await page.waitForSelector(`${inter.target}.pk-open`, { state: 'visible', timeout: WAIT })
        return { pass: true, detail: `${inter.target} 加 .pk-open 且可见` }
      }
      case 'close-modal': {
        // 关闭语义 = 移除 .pk-open（元素随之隐藏），故断言用 attached 而非 visible
        await page.waitForSelector(`${inter.target}:not(.pk-open)`, { state: 'attached', timeout: WAIT })
        return { pass: true, detail: `${inter.target} 已移除 .pk-open（隐藏）` }
      }
      case 'switch-tab': {
        const name = trig.id.startsWith('tab-') ? trig.id.slice(4) : null
        if (!name) return { pass: false, detail: `switch-tab 触发器应为 tab-<名>，实际 ${trig.id}` }
        await page.waitForSelector(`[data-proto-panel="${name}"].pk-active`, { timeout: WAIT })
        const aria = await page.evaluate(
          (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('aria-selected') : null },
          idSel(trig.id),
        )
        if (aria !== 'true') return { pass: false, detail: `面板已激活但按钮 aria-selected=${aria}` }
        return { pass: true, detail: `面板 [data-proto-panel="${name}"].pk-active，按钮 aria-selected=true` }
      }
      case 'submit': {
        await page.waitForSelector('[data-proto-toast]', { state: 'visible', timeout: WAIT })
        return { pass: true, detail: 'required 填齐后提交，[data-proto-toast] 可见' }
      }
      case 'toggle-drawer': {
        return { pass: true, detail: '已点击触发器；toggle-drawer 在 v0.1 无 DOM 断言（契约留白）' }
      }
      default:
        return { pass: false, detail: `未知 action: ${inter.action}` }
    }
  } catch (e) {
    const msg = String((e && e.message) || e)
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 3)
      .join(' | ')
    return { pass: false, detail: msg }
  }
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { usage(); process.exit(0) }
  if (!args.ir || (!args.serve && !args.url) || (args.serve && args.url)) { usage(); process.exit(1) }

  let ir
  try {
    ir = JSON.parse(fs.readFileSync(path.resolve(args.ir), 'utf8'))
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, errors: [{ path: args.ir, rule: 'ir.parse', message: String(e.message) }] }) + '\n')
    process.exit(1)
  }
  if (!Array.isArray(ir.pages) || ir.pages.length === 0) {
    process.stdout.write(JSON.stringify({ ok: false, errors: [{ path: 'pages', rule: 'ir.pages', message: 'pages 为空' }] }) + '\n')
    process.exit(1)
  }

  const loaded = await loadPlaywright()
  if (!loaded) {
    process.stdout.write(JSON.stringify({ ok: false, code: 2, missing: 'playwright', hints: playwrightMissingHint() }) + '\n')
    process.exit(2)
  }

  const reportDir = path.resolve(args.out || './gates-report')
  const shotsDir = path.join(reportDir, 'screenshots')
  fs.mkdirSync(shotsDir, { recursive: true })

  // 目标解析
  let server = null
  let baseUrl
  let targetLabel
  if (args.serve) {
    const servePath = path.resolve(args.serve)
    const st = fs.statSync(servePath)
    let rootDir, entryFile = null
    if (st.isFile()) {
      rootDir = path.dirname(servePath)
      entryFile = path.basename(servePath)
    } else {
      rootDir = servePath
    }
    const srv = createStaticServer(rootDir, entryFile, args.port || 8787)
    server = srv.server
    const port = await listenWithFallback(server, srv.startPort)
    baseUrl = `http://127.0.0.1:${port}/`
    targetLabel = `serve:${servePath}`
  } else {
    baseUrl = String(args.url).replace(/\/+$/, '') + '/'
    targetLabel = `url:${baseUrl}`
  }

  const index = buildIndex(ir)
  const pageIds = new Set(ir.pages.map((p) => p.id))
  const deadLinks = []
  const checks = []
  const g0Pages = []
  const screenshots = []

  // 死链（IR 级）：open-page 目标必须是存在 pageId
  for (const p of ir.pages) {
    for (const inter of p.interactions || []) {
      if (inter.action === 'open-page' && !pageIds.has(inter.target)) {
        deadLinks.push({ page: p.id, trigger: inter.trigger, kind: 'open-page', target: inter.target, message: `open-page 目标 ${inter.target} 不是存在的 pageId` })
      }
    }
  }

  let browser = null
  try {
    browser = await loaded.pw.chromium.launch()
  } catch (e) {
    if (server) server.close()
    process.stdout.write(
      JSON.stringify({
        ok: false,
        errors: [{ path: 'chromium', rule: 'launch', message: String((e && e.message) || e).split('\n')[0] }],
        hints: ['chromium 启动失败，可能未安装浏览器。执行: npx playwright install chromium', '镜像: PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/'],
      }) + '\n',
    )
    process.exit(1)
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })

  try {
    for (const p of ir.pages) {
      // 哨兵先挂，再导航
      const pg = await context.newPage()
      const pageErrors = []
      const consoleErrors = []
      pg.on('pageerror', (err) => pageErrors.push(String((err && err.message) || err)))
      pg.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

      await pg.goto(baseUrl + (args.url ? '#/' : '#') + p.id, { waitUntil: 'load', timeout: 20000 }).catch((e) =>
        pageErrors.push('goto: ' + String(e.message).split('\n')[0]),
      )
      await pg.waitForSelector(`[data-proto-page="${p.id}"]`, { timeout: 2000 }).catch(() => {})
      await pg.waitForTimeout(300)

      // G2 截图
      const shotFile = path.join(shotsDir, `${p.id}.png`)
      await pg.screenshot({ path: shotFile }).catch(() => {})
      screenshots.push({ page: p.id, file: toPosix(path.relative(process.cwd(), shotFile)) })

      // 死链（DOM 级）：open-modal 目标选择器在所属页 DOM 存在
      for (const inter of p.interactions || []) {
        if (inter.action === 'open-modal' && inter.target) {
          const exists = await pg
            .evaluate((t) => !!document.querySelector(t), inter.target)
            .catch(() => false)
          if (!exists) {
            deadLinks.push({ page: p.id, trigger: inter.trigger, kind: 'open-modal', target: inter.target, message: `选择器 ${inter.target} 在页 ${p.id} DOM 中不存在` })
          }
        }
      }

      // G3：逐条 interaction
      for (const inter of p.interactions || []) {
        const r = await execInteraction(pg, p.id, inter, index, Boolean(args.url))
        checks.push({ name: `${p.id} · ${inter.trigger} → ${inter.action}`, pass: r.pass, detail: r.detail })
      }

      g0Pages.push({ page: p.id, pageErrors, consoleErrors })
      await pg.close()
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    if (server) server.close()
  }

  const g0Ok = g0Pages.every((p) => p.pageErrors.length === 0 && p.consoleErrors.length === 0)
  const g3Ok = checks.every((c) => c.pass)
  const ok = g0Ok && g3Ok && deadLinks.length === 0

  const report = {
    ok,
    tool: 'proto-kit gates',
    target: targetLabel,
    baseUrl,
    playwrightPath: loaded.path,
    G0: { pages: g0Pages },
    G3: { checks },
    deadLinks,
    screenshots,
  }
  const reportFile = path.join(reportDir, 'gates-report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n')

  process.stdout.write(
    JSON.stringify({
      ok,
      target: targetLabel,
      pages: g0Pages.length,
      g3: { pass: checks.filter((c) => c.pass).length, total: checks.length },
      deadLinks: deadLinks.length,
      screenshots: screenshots.length,
      report: toPosix(path.relative(process.cwd(), reportFile)) || toPosix(reportFile),
    }) + '\n',
  )
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, errors: [{ path: 'gates', rule: 'unhandled', message: String((e && e.message) || e) }] }) + '\n')
  process.exit(1)
})
