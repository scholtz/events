import { render } from '../dist/server/entry-server.js'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

export default async function handler(req, res) {
  try {
    const url = req.url || '/'

    const { html } = await render(url)

    const template = await readFile(resolve('./dist/index.html'), 'utf-8')
    const rendered = template.replace('<!--ssr-outlet-->', html)

    res.setHeader('Content-Type', 'text/html')
    res.end(rendered)
  } catch (error) {
    console.error(error)
    res.status(500).end('Internal Server Error')
  }
}
