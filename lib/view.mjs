import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'
import { ROOT } from './paths.mjs'

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function mime(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

/**
 * Serve Photo Sphere Viewer for a still (3d) or video (4d) equirect asset.
 * Blocks until the process is killed (Ctrl+C).
 */
export async function view(mode, assetPath, port = Number(process.env.SEVEN_DPS_PORT || 8765)) {
  const asset = resolve(assetPath)
  if (!existsSync(asset)) throw new Error(`missing asset: ${asset}`)

  const assetDir = dirname(asset)
  const assetName = basename(asset)
  const viewerRel = mode === '4d' ? 'viewers/psv-4d.html' : 'viewers/psv-3d.html'
  const viewerFile = join(ROOT, viewerRel)
  if (!existsSync(viewerFile)) throw new Error(`missing viewer ${viewerFile}`)

  const q = mode === '4d' ? `video=/${assetName}` : `panorama=/${assetName}`

  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    let file
    if (url === '/' || url.startsWith('/index')) {
      file = viewerFile
    } else if (url.startsWith('/node_modules/')) {
      file = join(ROOT, url.slice(1))
    } else if (url === `/${assetName}`) {
      file = asset
    } else if (url.startsWith('/viewers/')) {
      file = join(ROOT, url.slice(1))
    } else {
      const nextToAsset = join(assetDir, url.replace(/^\//, ''))
      file = existsSync(nextToAsset) ? nextToAsset : join(ROOT, url.replace(/^\//, ''))
    }
    try {
      const body = readFileSync(file)
      res.writeHead(200, { 'Content-Type': mime(file) })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end(`not found: ${url}`)
    }
  })

  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  console.log(`7dps view ${mode}: http://127.0.0.1:${port}/?${q}`)
  console.log(`asset: ${asset}`)
  console.log('Photo Sphere Viewer — Ctrl+C to stop')
  await new Promise(() => {})
}
