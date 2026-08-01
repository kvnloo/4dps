import { createServer } from 'node:http'
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { ROOT, resolveAsset } from './paths.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

/** Resolve packages via Node (works for local, hoisted, and nested installs). */
const require = createRequire(join(ROOT, 'package.json'))

function mime(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

/**
 * Find an installed package root via Node resolution (local, nested, or hoisted).
 * Uses the package entry point and walks up for package.json — avoids
 * `exports` blocks that reject `./package.json` subpath resolves.
 */
export function resolvePackageRoot(pkg) {
  let entry
  try {
    entry = require.resolve(pkg)
  } catch {
    return null
  }
  let dir = dirname(entry)
  for (;;) {
    const pj = join(dir, 'package.json')
    if (existsSync(pj)) {
      try {
        if (JSON.parse(readFileSync(pj, 'utf8')).name === pkg) return dir
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Resolve a file inside an installed package.
 * pathAfterPkg e.g. "three/build/three.module.js" or
 * "@photo-sphere-viewer/core/index.module.js"
 */
export function resolveVendor(pathAfterPkg) {
  const clean = String(pathAfterPkg || '').replace(/^\/+/, '').replace(/\\/g, '/')
  if (!clean || clean.includes('..')) return null

  const parts = clean.split('/')
  let pkg
  let rest
  if (clean.startsWith('@')) {
    if (parts.length < 2) return null
    pkg = `${parts[0]}/${parts[1]}`
    rest = parts.slice(2).join('/')
  } else {
    pkg = parts[0]
    rest = parts.slice(1).join('/')
  }

  const pkgRoot = resolvePackageRoot(pkg)
  if (!pkgRoot) return null

  const file = rest ? resolve(pkgRoot, rest) : pkgRoot
  if (!file.startsWith(pkgRoot) || !existsSync(file)) return null
  return file
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!m) return null
  let start = m[1] === '' ? NaN : Number(m[1])
  let end = m[2] === '' ? NaN : Number(m[2])
  if (Number.isNaN(start) && Number.isNaN(end)) return null
  if (Number.isNaN(start)) {
    // suffix: last N bytes
    const n = end
    if (n <= 0) return null
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    if (Number.isNaN(end) || end >= size) end = size - 1
    if (start >= size || start > end) return null
  }
  return { start, end }
}

function sendFile(req, res, file) {
  const st = statSync(file)
  if (st.isDirectory()) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  const type = mime(file)
  const size = st.size
  const range = parseRange(req.headers.range, size)

  if (range) {
    const { start, end } = range
    const len = end - start + 1
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': len,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    })
    createReadStream(file, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

/**
 * Inject import map so bare specifiers resolve without a bundler:
 *   three, @photo-sphere-viewer/*
 */
function injectImportMap(html) {
  const need = [
    ['three', 'three/build/three.module.js'],
    ['@photo-sphere-viewer/core', '@photo-sphere-viewer/core/index.module.js'],
    [
      '@photo-sphere-viewer/autorotate-plugin',
      '@photo-sphere-viewer/autorotate-plugin/index.module.js',
    ],
    [
      '@photo-sphere-viewer/equirectangular-video-adapter',
      '@photo-sphere-viewer/equirectangular-video-adapter/index.module.js',
    ],
    [
      '@photo-sphere-viewer/video-plugin',
      '@photo-sphere-viewer/video-plugin/index.module.js',
    ],
  ]
  const imports = {}
  for (const [spec, path] of need) {
    if (!resolveVendor(path)) {
      // video packages optional for 3d-only pages
      if (spec.includes('video')) continue
      if (spec.includes('autorotate')) continue
      throw new Error(
        `cannot resolve "${spec}" (${path}). Run npm install in the 7dps package.`,
      )
    }
    imports[spec] = `/vendor/${path}`
  }
  // Always require three
  if (!imports.three) {
    throw new Error('cannot resolve package "three". Run npm install in 7dps.')
  }
  // Prefer mapping all that resolved
  for (const [spec, path] of need) {
    if (resolveVendor(path)) imports[spec] = `/vendor/${path}`
  }
  // Gallery sphere mode needs OrbitControls via three/addons/*
  if (resolveVendor('three/examples/jsm/controls/OrbitControls.js')) {
    imports['three/addons/'] = '/vendor/three/examples/jsm/'
  }

  const map = `<script type="importmap">
${JSON.stringify({ imports }, null, 2)}
</script>
`
  if (/type=["']importmap["']/.test(html)) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${map}</head>`)
  return map + html
}

function openBrowser(url) {
  if (process.env.SEVEN_DPS_NO_OPEN) return
  const plat = process.platform
  let cmd
  let args
  if (plat === 'darwin') {
    cmd = 'open'
    args = [url]
  } else if (plat === 'win32') {
    cmd = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    cmd = 'xdg-open'
    args = [url]
  }
  try {
    const child = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true,
      shell: false,
    })
    child.unref()
  } catch {
    /* optional convenience — ignore missing opener */
  }
}

/**
 * Bind preferred port; on EADDRINUSE try preferred+1 … preferred+49.
 * Returns the port that accepted the listen.
 */
export function listenFree(server, preferred = 8765, host = '127.0.0.1') {
  const start = Number(preferred) || 8765
  const max = start + 50

  return new Promise((ok, fail) => {
    let port = start

    const tryListen = () => {
      const onError = (err) => {
        server.off('listening', onListening)
        if (err && err.code === 'EADDRINUSE' && port + 1 < max) {
          port += 1
          tryListen()
          return
        }
        fail(err || new Error(`could not bind port near ${start}`))
      }
      const onListening = () => {
        server.off('error', onError)
        ok(port)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    }

    tryListen()
  })
}

/**
 * Build the static server for a 3d/4d view session.
 * Returns { server, assetName, query, mode } — call listenFree yourself or use view().
 */
export function createViewServer(mode, assetPath) {
  // cwd first, then package ROOT (so fixtures/ works after global/link install)
  const asset = resolveAsset(assetPath)
  if (!existsSync(asset)) {
    throw new Error(
      `missing asset: ${assetPath}\n  tried cwd and package root (${ROOT})`,
    )
  }

  const assetDir = dirname(asset)
  const assetName = basename(asset)
  const viewerRel = mode === '4d' ? 'viewers/psv-4d.html' : 'viewers/psv-3d.html'
  const viewerFile = join(ROOT, viewerRel)
  if (!existsSync(viewerFile)) throw new Error(`missing viewer ${viewerFile}`)

  // Probe critical vendor paths early so CLI fails fast offline.
  const need = [
    '@photo-sphere-viewer/core/index.module.js',
    '@photo-sphere-viewer/core/index.css',
    'three/build/three.module.js',
  ]
  if (mode === '4d') {
    need.push(
      '@photo-sphere-viewer/equirectangular-video-adapter/index.module.js',
      '@photo-sphere-viewer/video-plugin/index.module.js',
      '@photo-sphere-viewer/video-plugin/index.css',
    )
  } else {
    need.push('@photo-sphere-viewer/autorotate-plugin/index.module.js')
  }
  for (const p of need) {
    if (!resolveVendor(p)) {
      throw new Error(
        `cannot resolve /vendor/${p} — npm install dependencies in the 7dps package (or hoist them where Node can find them)`,
      )
    }
  }

  const q = mode === '4d' ? `video=/${assetName}` : `panorama=/${assetName}`

  const server = createServer((req, res) => {
    const raw = req.url || '/'
    const url = raw.split('?')[0]

    try {
      if (url === '/' || url === '/index' || url === '/index.html') {
        const html = injectImportMap(readFileSync(viewerFile, 'utf8'))
        const body = Buffer.from(html, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-cache',
        })
        res.end(req.method === 'HEAD' ? undefined : body)
        return
      }

      if (url.startsWith('/vendor/')) {
        const file = resolveVendor(url.slice('/vendor/'.length))
        if (!file) {
          res.writeHead(404)
          res.end(`not found: ${url}`)
          return
        }
        sendFile(req, res, file)
        return
      }

      // Back-compat: old HTML paths under /node_modules/
      if (url.startsWith('/node_modules/')) {
        const file = resolveVendor(url.slice('/node_modules/'.length))
        if (!file) {
          res.writeHead(404)
          res.end(`not found: ${url}`)
          return
        }
        sendFile(req, res, file)
        return
      }

      if (url === `/${assetName}`) {
        sendFile(req, res, asset)
        return
      }

      if (url.startsWith('/viewers/')) {
        const file = join(ROOT, url.slice(1))
        if (!file.startsWith(ROOT) || !existsSync(file)) {
          res.writeHead(404)
          res.end(`not found: ${url}`)
          return
        }
        sendFile(req, res, file)
        return
      }

      const nextToAsset = join(assetDir, url.replace(/^\//, ''))
      if (existsSync(nextToAsset) && nextToAsset.startsWith(assetDir)) {
        sendFile(req, res, nextToAsset)
        return
      }

      res.writeHead(404)
      res.end(`not found: ${url}`)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e.message || e))
    }
  })

  return { server, asset, assetName, query: q, mode }
}

/**
 * Serve Photo Sphere Viewer for a still (3d) or video (4d) equirect asset.
 * Blocks until the process is killed (Ctrl+C), unless opts.block === false
 * (returns { server, port, url } for tests).
 */
export async function view(mode, assetPath, opts = {}) {
  const preferred = Number(
    opts.port ?? process.env.SEVEN_DPS_PORT ?? 8765,
  )
  const block = opts.block !== false
  const shouldOpen = opts.open !== false

  const { server, asset, query } = createViewServer(mode, assetPath)
  const port = await listenFree(server, preferred)
  const url = `http://127.0.0.1:${port}/?${query}`

  console.log(`7dps view ${mode}: ${url}`)
  console.log(`asset: ${asset}`)
  if (port !== preferred) {
    console.log(`port ${preferred} busy — using ${port}`)
  }
  console.log('Photo Sphere Viewer — Ctrl+C to stop')

  if (shouldOpen) openBrowser(url)

  if (!block) return { server, port, url, query }

  await new Promise(() => {})
}
