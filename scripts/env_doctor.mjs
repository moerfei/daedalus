#!/usr/bin/env node
/*
 * daedalus env_doctor.mjs — 环境医生
 *
 * CLI:
 *   node env_doctor.mjs [--fix]
 *
 * 检查 node>=20 / npm / playwright（解析顺序与 gates.mjs 一致）：
 *   stdout JSON {node,npm,playwright:{ok,path},missing,hints}
 * --fix：在 ~/.zcode/cli/plugins/data/daedalus@local-plugins/ 下
 *   npm init -y + npm i playwright@1.x --no-audit --no-fund + npx playwright install chromium
 *   （继承 stdio；失败输出镜像 hint：PLAYWRIGHT_DOWNLOAD_HOST 与 npmmirror）。
 * 零 npm 依赖，仅 node: 内置模块；Node >= 20 ESM。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const PKG_DATA_DIR = () => path.join(os.homedir(), '.zcode', 'cli', 'plugins', 'data', 'daedalus@local-plugins')
const PW_LOCAL_DIR = () => path.join(PKG_DATA_DIR(), 'node_modules', 'playwright')

const MIRROR_HINTS = [
  '下载不畅时使用镜像：',
  '  export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/',
  '  npm 可加 --registry=https://registry.npmmirror.com',
]

// ---------- 检查 ----------

function checkNode() {
  const version = process.version
  const major = Number(/^v(\d+)/.exec(version)?.[1] || 0)
  return { ok: major >= 20, version, major }
}

function checkNpm() {
  const res = spawnSync('npm', ['-v'], { shell: process.platform === 'win32', encoding: 'utf8' })
  if (res.status !== 0 || !res.stdout) return { ok: false, version: null }
  return { ok: true, version: res.stdout.trim() }
}

function resolvePlaywrightPath() {
  // 顺序与 gates.mjs 一致：import('playwright') → daedalus 本地数据目录
  try {
    const req = createRequire(path.join(process.cwd(), 'noop.js'))
    const resolved = req.resolve('playwright')
    return path.dirname(resolved)
  } catch { /* 继续 */ }
  if (fs.existsSync(path.join(PW_LOCAL_DIR(), 'package.json'))) return PW_LOCAL_DIR()
  return null
}

async function checkPlaywright() {
  try {
    const m = await import('playwright')
    const pw = m.default && m.default.chromium ? m.default : m
    if (pw && pw.chromium) return { ok: true, path: 'playwright' }
  } catch { /* 落到本地目录 */ }
  const local = resolvePlaywrightPath()
  if (local) {
    try {
      const req = createRequire(path.join(local, 'noop.js'))
      const pw = req(local)
      if (pw && pw.chromium) return { ok: true, path: local }
    } catch { /* 视为不可用 */ }
  }
  return { ok: false, path: null }
}

// ---------- 修复 ----------

function run(cmd, cmdArgs, cwd) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env },
  })
  return res.status === 0
}

function fixPlaywright() {
  const dir = PKG_DATA_DIR()
  fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    // 注意：不能用 `npm init -y`——目录名 daedalus@local-plugins 含 @ 不是合法包名，
    // npm 会报 Invalid name。这里直接写入最小 package.json（等效 npm init -y）。
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'daedalus-playwright', version: '0.0.0', private: true }, null, 2) + '\n',
    )
  }
  if (!run('npm', ['i', 'playwright@1.x', '--no-audit', '--no-fund'], dir)) {
    console.error('[fix] npm i playwright 失败')
    MIRROR_HINTS.forEach((h) => console.error(h))
    return false
  }
  if (!run('npx', ['playwright', 'install', 'chromium'], dir)) {
    console.error('[fix] npx playwright install chromium 失败')
    MIRROR_HINTS.forEach((h) => console.error(h))
    return false
  }
  return true
}

// ---------- 主流程 ----------

async function main() {
  const fix = process.argv.includes('--fix')

  if (fix) {
    console.error(`[fix] 目标目录: ${PKG_DATA_DIR()}`)
    const okFix = fixPlaywright()
    if (!okFix) {
      process.stdout.write(
        JSON.stringify({ ok: false, fixed: false, hints: MIRROR_HINTS }) + '\n',
      )
      process.exit(1)
    }
  }

  const node = checkNode()
  const npm = checkNpm()
  const playwright = await checkPlaywright()

  const missing = []
  if (!node.ok) missing.push('node>=20')
  if (!npm.ok) missing.push('npm')
  if (!playwright.ok) missing.push('playwright')

  const hints = []
  if (!node.ok) hints.push(`当前 node ${node.version}，请升级到 >= 20`)
  if (!npm.ok) hints.push('未检测到可用的 npm，请确认 Node 安装完整')
  if (!playwright.ok) {
    hints.push('执行 node env_doctor.mjs --fix 安装 playwright 到 daedalus 数据目录')
    hints.push('或手动: npm i playwright && npx playwright install chromium')
    hints.push(...MIRROR_HINTS)
  }

  process.stdout.write(
    JSON.stringify(
      { ok: missing.length === 0, node, npm, playwright, missing, hints, ...(fix ? { fixed: true } : {}) },
      null,
      2,
    ) + '\n',
  )
  process.exit(missing.length === 0 ? 0 : 1)
}

main()
