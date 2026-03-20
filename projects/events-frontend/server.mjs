import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const distDir = resolve(__dirname, 'dist')
const port = parseInt(process.env.PORT || '3000', 10)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}

async function tryServeStatic(url, res) {
  const safePath = url.split('?')[0].split('#')[0]
  if (safePath.includes('..')) return false

  const filePath = join(distDir, safePath)
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const content = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(content)
    return true
  } catch {
    return false
  }
}

let render
try {
  const ssrModule = await import('./dist/server/entry-server.js')
  render = ssrModule.render
} catch (error) {
  console.error('SSR module not available, falling back to static serving:', error.message)
}

const template = await readFile(resolve(distDir, 'index.html'), 'utf-8')

const server = createServer(async (req, res) => {
  const url = req.url || '/'

  // Health check endpoint
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }

  // Try serving static assets first
  if (await tryServeStatic(url, res)) return

  // SSR fallback for SPA routes
  try {
    if (render) {
      const { html } = await render(url)
      const rendered = template.replace('<!--ssr-outlet-->', html)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(rendered)
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(template)
    }
  } catch (error) {
    console.error('SSR render error:', error)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(template)
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Events frontend listening on http://0.0.0.0:${port}`)
})
