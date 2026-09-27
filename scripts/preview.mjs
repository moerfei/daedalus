#!/usr/bin/env node
/*
 * daedalus preview.mjs — 静态预览服务器
 *
 * CLI:
 *   node preview.mjs <dir|file.html> [--port 5179] [--open]
 *
 * node:http 零依赖静态服务（mime: html/js/css/png/svg/json 等）；
 * file.html → serve 其所在目录且 / 重定向到该文件名；--open 尽力调系统默认浏览器；
 * Ctrl-C 退出。成功启动打印 http://127.0.0.1:<port>/ 。Node >= 20 ESM。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function usage() {
  console.error('用法: node preview.mjs <dir|file.html> [--port 5179] [--open]')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') args.port = Number(argv[++i])
    else if (a === '--open') args.open = true
    else if (a === '-h' || a === '--help') args.help = true
    else args.target = argv[i]
  }
  return args
}

function openBrowser(url) {
  // 尽力而为：win 用 start，其余平台常见开浏览器命令
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch { /* 尽力打开，失败不阻塞 */ }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.target) { usage(); process.exit(args.help ? 0 : 1) }

  const targetPath = path.resolve(args.target)
  if (!fs.existsSync(targetPath)) {
    console.error(`路径不存在: ${targetPath}`)
    process.exit(1)
  }
  const st = fs.statSync(targetPath)
  const rootDir = st.isFile() ? path.dirname(targetPath) : targetPath
  const entryFile = st.isFile() ? path.basename(targetPath) : null
  const port = Number.isInteger(args.port) && args.port > 0 ? args.port : 5179

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
      if (urlPath === '/' && entryFile) {
        res.writeHead(302, { Location: '/' + entryFile })
        res.end()
        return
      }
      let filePath = path.resolve(rootDir, '.' + urlPath)
      if (!filePath.startsWith(rootDir + path.sep) && filePath !== rootDir) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      let fst = await fs.promises.stat(filePath).catch(() => null)
      if (fst && fst.isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        fst = await fs.promises.stat(filePath).catch(() => null)
      }
      if (!fst || !fst.isFile()) {
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
      res.end(String((e && e.message) || e))
    }
  })

  server.on('error', (e) => {
    console.error(`启动失败: ${e.message}（端口 ${port} 可能被占用，试试 --port 换一个）`)
    process.exit(1)
  })

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`
    process.stdout.write(
      JSON.stringify({ ok: true, url, root: rootDir, entry: entryFile || 'index.html' }) + '\n',
    )
    console.error(`daedalus preview: ${url}  （root: ${rootDir}${entryFile ? '，/ → ' + entryFile : ''}，Ctrl-C 退出）`)
    if (args.open) openBrowser(url)
  })

  process.on('SIGINT', () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 500).unref()
  })
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 500).unref()
  })
}

main()
