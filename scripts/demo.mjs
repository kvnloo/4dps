#!/usr/bin/env node
/**
 * Local demo server — Photo Sphere Viewer + ramen equirect assets (PSV only).
 *
 *   npm run demo
 *   → http://127.0.0.1:5177/
 *
 * Asset preference (still + video):
 *   1. ramen-hq-photosphere   (HQ re-capture)
 *   2. ramen-demo-photosphere (known demo pack)
 *   3. fixtures/sample-equirect.*  (offline smoke only)
 *
 * plaza-photosphere is intentionally excluded (near-black failed pack).
 *
 * Face sync quarantine (H5/H8):
 *   - Measure face edge px (magick identify)
 *   - social bar: face ≥ 1024; hard faces pass reject-black
 *   - py non-void; black/void py → do NOT promote faces tier (facesSynced=false)
 *   - levels.json faceSize from measure; report measured face px
 *
 * Serves:
 *   /                 demo/index.html (PSV 3D / 4D tabs)
 *   /assets/*         demo/assets (ramen equirect still + mp4)
 *   /vendor/*         three + @photo-sphere-viewer from node_modules
 */
import { createServer } from 'node:http'
import {
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ROOT } from '../lib/paths.mjs'
import { resolveVendor, listenFree } from '../lib/view.mjs'
import { loadPreset } from '../lib/presets.mjs'

const PORT = Number(process.env.DEMO_PORT || 5177)
const DEMO = join(ROOT, 'demo')
const ASSETS = join(DEMO, 'assets')
const QUALITY = process.env.DEMO_QUALITY || process.env.SEVEN_DPS_QUALITY || 'social'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
const HARD_FACES = ['px', 'nx', 'pz', 'nz', 'ny']

/** Soft night-market ambience bed (Wallpaper Engine style) if host has none. */
function ensureAmbientAudio(room) {
  const dst = join(ASSETS, 'ambient.mp3')
  const candidates = [
    join(room, 'shots/ramen-hq-photosphere/ambient.mp3'),
    join(room, 'public/audio/night-market.mp3'),
    join(room, 'public/audio/ambient.mp3'),
    join(ROOT, 'fixtures/ambient.mp3'),
  ]
  const src = candidates.find((p) => existsSync(p))
  if (src) {
    copyFileSync(src, dst)
    return dst
  }
  // Procedural soft bed: pink noise + low pad (no external assets required)
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=pink:amplitude=0.035:sample_rate=44100:duration=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=92:sample_rate=44100:duration=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=138:sample_rate=44100:duration=12',
      '-filter_complex',
      '[1]volume=0.04[a];[2]volume=0.03[b];[0][a][b]amix=inputs=3:duration=first:dropout_transition=0,afade=t=in:st=0:d=1.2,afade=t=out:st=10.5:d=1.5',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '5',
      dst,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0 || !existsSync(dst)) {
    console.warn('  ambient audio generate skipped:', (r.stderr || '').slice(-200))
    return null
  }
  console.log('  ambient ← generated night-market bed')
  return dst
}

function mime(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

function send(req, res, file) {
  const st = statSync(file)
  const type = mime(file)
  const size = st.size
  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (m) {
      let start = m[1] === '' ? 0 : Number(m[1])
      let end = m[2] === '' ? size - 1 : Number(m[2])
      if (end >= size) end = size - 1
      if (start <= end) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        })
        createReadStream(file, { start, end }).pipe(res)
        return
      }
    }
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
  })
  createReadStream(file).pipe(res)
}

/** Inject import map so PSV + three bare imports resolve (incl. gallery sphere OrbitControls). */
function injectImportMap(html) {
  const pairs = [
    ['three', 'three/build/three.module.js'],
    // Trailing slash map so `three/addons/…` resolves under examples/jsm
    ['three/addons/', 'three/examples/jsm/'],
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
  for (const [spec, path] of pairs) {
    // Prefix maps: only require package root / a known file under prefix
    if (spec.endsWith('/')) {
      const probe = path + 'controls/OrbitControls.js'
      if (resolveVendor(probe)) imports[spec] = `/vendor/${path}`
      continue
    }
    if (resolveVendor(path)) imports[spec] = `/vendor/${path}`
  }
  if (!imports.three) {
    throw new Error('three not found — run npm install in 4dps')
  }
  if (!imports['three/addons/']) {
    throw new Error('three/addons (OrbitControls) not found — check three install')
  }
  const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>\n`
  return html.replace(/<\/head>/i, `${map}</head>`)
}

function roomRoot() {
  return resolve(
    process.env.PORTFOLIO_ROOM || join(ROOT, '../../../portfolio/demos/room'),
  )
}

function magickFx(file, expr) {
  const r = spawnSync(
    'magick',
    [file, '-colorspace', 'Gray', '-format', `%[fx:${expr}]`, 'info:'],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const n = Number(String(r.stdout).trim())
  return Number.isFinite(n) ? n : null
}

function identifyEdge(file) {
  const r = spawnSync(
    'magick',
    ['identify', '-format', '%w %h', file],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const parts = String(r.stdout).trim().split(/\s+/)
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return { width: w, height: h, edge: Math.min(w, h) }
}

/**
 * Measure + quarantine cube faces for social (or DEMO_QUALITY) bar.
 * Returns { ok, faceSize, faces, reasons, quarantine }
 */
function evaluateFaces(facesDir, preset) {
  const faceMin = Number(preset?.photosphere?.size || preset?.photosphere?.face_size || 1024)
  const minMean = Math.max(0.03, Number(preset?.capture?.rejectBlackMean || 0.02) * 1.5)
  const minStd = Math.max(0.015, Number(preset?.capture?.rejectBlackStd || 0.01))
  const skyVoidMean = 0.02
  const skyVoidStd = 0.005

  const faces = {}
  const reasons = []
  let minEdge = Infinity

  for (const name of FACE_NAMES) {
    const file = join(facesDir, `${name}.png`)
    const rec = { name, file, ok: false }
    faces[name] = rec
    if (!existsSync(file)) {
      reasons.push(`missing ${name}.png`)
      continue
    }
    const st = statSync(file)
    rec.bytes = st.size
    const dim = identifyEdge(file)
    if (!dim) {
      reasons.push(`${name}: magick identify failed`)
      continue
    }
    rec.width = dim.width
    rec.height = dim.height
    rec.edge = dim.edge
    if (dim.edge < minEdge) minEdge = dim.edge

    const mean = magickFx(file, 'mean')
    const std = magickFx(file, 'standard_deviation')
    rec.mean = mean
    rec.std = std

    if (HARD_FACES.includes(name)) {
      if (dim.edge < faceMin) {
        reasons.push(`${name}: edge ${dim.edge}px < social/min face ${faceMin}px`)
      }
      if (mean == null || mean < minMean) {
        reasons.push(`${name}: mean ${mean} < ${minMean} (reject-black)`)
      }
      if (std == null || std < minStd) {
        reasons.push(`${name}: std ${std} < ${minStd} (flat void)`)
      }
      if (st.size < 8000) {
        reasons.push(`${name}: ${st.size} B too small`)
      }
    }

    if (name === 'py') {
      if (mean != null && std != null && mean < skyVoidMean && std <= skyVoidStd) {
        reasons.push(
          `py: void sky mean=${mean.toFixed(4)} std=${std.toFixed(4)} (non-void policy — quarantine faces tier)`,
        )
      }
      if (st.size < 2000) {
        reasons.push(`py: ${st.size} B stub (void RT)`)
      }
    }

    rec.ok = !reasons.some((r) => r.startsWith(`${name}:`) || r === `missing ${name}.png` || (name === 'py' && r.startsWith('py:')))
  }

  // Recompute ok per face from final reasons
  for (const name of FACE_NAMES) {
    faces[name].ok = !reasons.some(
      (r) =>
        r === `missing ${name}.png` ||
        r.startsWith(`${name}:`) ||
        (name === 'py' && r.startsWith('py:')),
    )
  }

  const faceSize = Number.isFinite(minEdge) && minEdge !== Infinity ? minEdge : null
  const hardOk = HARD_FACES.every((n) => faces[n]?.ok)
  const skyOk = faces.py?.ok === true
  // Also fail size if any measured edge under bar
  if (faceSize != null && faceSize < faceMin) {
    if (!reasons.some((r) => r.includes(`edge ${faceSize}px`))) {
      reasons.push(`faceSize ${faceSize}px < min ${faceMin}px (${QUALITY} bar)`)
    }
  }

  const ok = hardOk && skyOk && reasons.length === 0
  return {
    ok,
    faceSize,
    faceMin,
    faces,
    reasons,
    quarantine: !ok,
    hardOk,
    skyOk,
  }
}

/**
 * Pull best available ramen equirect still (+ 4d mp4) into demo/assets.
 * Also sync cube faces + multi-tier equirects for gallery super-res zoom.
 * Prefer HQ label, then demo pack; never plaza-photosphere (failed near-black).
 */
function syncRamenAssets() {
  mkdirSync(ASSETS, { recursive: true })
  const room = roomRoot()

  let preset = null
  try {
    preset = loadPreset(QUALITY)
  } catch {
    preset = { photosphere: { size: 1024 }, capture: { rejectBlackMean: 0.02, rejectBlackStd: 0.01 } }
  }
  const faceMin = Number(preset?.photosphere?.size || preset?.photosphere?.face_size || 1024)

  /** Packs ordered best → fallback (never plaza-black). */
  const packDirs = [
    join(room, 'shots/ramen-hq-photosphere'),
    join(room, 'shots/ramen-hq/photosphere'),
    join(room, 'shots/ramen-demo-photosphere'),
    join(room, 'shots/ramen-demo/photosphere'),
  ]

  const stillCandidates = [
    ...packDirs.map((d) => join(d, 'equirect.png')),
    join(room, 'shots/ramen-hq/equirect.png'),
    join(ROOT, 'fixtures/sample-equirect.png'),
  ]
  const videoCandidates = [
    join(room, 'shots/ramen-hq-photosphere/equirect.mp4'),
    join(room, 'shots/ramen-hq/4d/equirect.mp4'),
    join(room, 'shots/ramen-hq/equirect.mp4'),
    join(room, 'shots/ramen-demo-photosphere/equirect.mp4'),
    join(room, 'shots/ramen-demo/4d/equirect.mp4'),
    join(ROOT, 'fixtures/sample-equirect.mp4'),
  ]
  // Higher-tier equirects (print/archive) if host captured them
  const hiStillCandidates = [
    join(room, 'shots/ramen-hq-photosphere/equirect-print.png'),
    join(room, 'shots/ramen-hq-photosphere/equirect-4k.png'),
    join(room, 'shots/ramen-hq-print-photosphere/equirect.png'),
    join(room, 'shots/ramen-hq-photosphere/equirect-archive.png'),
  ]

  const stillSrc = stillCandidates.find((p) => existsSync(p))
  const videoSrc = videoCandidates.find((p) => existsSync(p))
  if (!stillSrc) {
    throw new Error(
      'No equirect still for demo. Capture host photosphere (ramen-hq or ramen-demo) or ensure fixtures/sample-equirect.png exists.',
    )
  }
  if (!videoSrc) {
    throw new Error(
      'No equirect mp4 for demo. Encode multi-frame 4D (host) or ensure fixtures/sample-equirect.mp4 exists.',
    )
  }

  const stillDst = join(ASSETS, 'ramen-equirect.png')
  const videoDst = join(ASSETS, 'ramen-equirect.mp4')
  copyFileSync(stillSrc, stillDst)
  copyFileSync(videoSrc, videoDst)

  // Base equirect size (for levels faceSize note when no faces)
  let baseFaceSize = null
  const stillDim = identifyEdge(stillDst)
  if (stillDim) {
    // equirect ≈ 2×face × face → face ≈ height
    baseFaceSize = stillDim.height
  }

  // Progressive quality ladder for gallery zoom (base → hi)
  const levels = [
    {
      id: 'base',
      equirect: '/assets/ramen-equirect.png',
      faceSize: baseFaceSize,
    },
  ]
  const hiSrc = hiStillCandidates.find((p) => existsSync(p))
  if (hiSrc) {
    const hiDst = join(ASSETS, 'ramen-equirect-hi.png')
    copyFileSync(hiSrc, hiDst)
    const hiDim = identifyEdge(hiDst)
    levels.push({
      id: 'hi',
      equirect: '/assets/ramen-equirect-hi.png',
      faceSize: hiDim ? hiDim.height : null,
    })
    console.log('  3d-hi ←', hiSrc, hiDim ? `(face≈${hiDim.height}px)` : '')
  }

  // Cube faces for super-res zoom — quarantine if void py / undersized / black hard faces
  let facesDir = null
  for (const d of packDirs) {
    if (FACE_NAMES.every((n) => existsSync(join(d, `${n}.png`)))) {
      facesDir = d
      break
    }
  }
  const facesOut = join(ASSETS, 'faces')
  let facesSynced = false
  let faceEval = null
  let measuredFacePx = null

  if (facesDir) {
    faceEval = evaluateFaces(facesDir, preset)
    measuredFacePx = faceEval.faceSize

    console.log(
      `  faces measure: edge=${measuredFacePx ?? '?'}px (min bar ${faceMin}px @ ${QUALITY})`,
    )
    for (const name of FACE_NAMES) {
      const f = faceEval.faces[name]
      if (!f) continue
      const m = f.mean != null ? f.mean.toFixed(3) : '?'
      const s = f.std != null ? f.std.toFixed(3) : '?'
      console.log(
        `    ${name}: ${f.edge ?? '?'}px mean=${m} std=${s} bytes=${f.bytes ?? '?'} ${f.ok ? 'ok' : 'FAIL'}`,
      )
    }

    if (faceEval.ok) {
      mkdirSync(facesOut, { recursive: true })
      for (const n of FACE_NAMES) {
        copyFileSync(join(facesDir, `${n}.png`), join(facesOut, `${n}.png`))
      }
      facesSynced = true
      levels.push({
        id: 'faces',
        faces: FACE_NAMES.map((n) => `/assets/faces/${n}.png`),
        faceSize: measuredFacePx,
      })
      console.log('  facesSynced: true ←', facesDir, `(${measuredFacePx}px)`)
    } else {
      facesSynced = false
      console.warn('  facesSynced: false (QUARANTINE) — not promoting faces tier')
      for (const r of faceEval.reasons) {
        console.warn('    -', r)
      }
      // Still copy faces to assets for debugging but do not list as zoom tier
      mkdirSync(facesOut, { recursive: true })
      for (const n of FACE_NAMES) {
        const src = join(facesDir, `${n}.png`)
        if (existsSync(src)) copyFileSync(src, join(facesOut, `${n}.png`))
      }
      console.warn(
        '  faces files copied to demo/assets/faces for inspect only; levels has no faces tier',
      )
    }
  } else {
    console.log('  faces: none found in pack dirs')
  }

  const ambient = ensureAmbientAudio(room)

  const noteParts = [
    '4D = living photosphere (scene time + audio), not yaw spin.',
    'Gallery zooms: equirect → hi equirect (if present) → native cube faces when facesSynced.',
  ]
  if (measuredFacePx != null) {
    noteParts.push(`Measured cube face edge: ${measuredFacePx}px (bar ${faceMin}px @ ${QUALITY}).`)
  }
  if (faceEval?.quarantine) {
    noteParts.push(
      `Faces tier quarantined: ${faceEval.reasons.slice(0, 3).join('; ')}${faceEval.reasons.length > 3 ? '…' : ''}`,
    )
  }

  writeFileSync(
    join(ASSETS, 'levels.json'),
    JSON.stringify(
      {
        kind: '4dps-demo-levels',
        still: '/assets/ramen-equirect.png',
        video: '/assets/ramen-equirect.mp4',
        ambient: ambient ? '/assets/ambient.mp3' : null,
        quality: QUALITY,
        faceMin,
        measuredFacePx: measuredFacePx,
        facesSynced,
        levels,
        faces: facesSynced ? FACE_NAMES.map((n) => `/assets/faces/${n}.png`) : null,
        quarantine: faceEval?.quarantine
          ? { reasons: faceEval.reasons, hardOk: faceEval.hardOk, skyOk: faceEval.skyOk }
          : null,
        note: noteParts.join(' '),
      },
      null,
      2,
    ),
  )

  console.log('demo assets:')
  console.log('  3d ←', stillSrc)
  console.log('  4d ←', videoSrc)
  if (ambient) console.log('  ambient ←', ambient)
  console.log(
    `  face px: measured=${measuredFacePx ?? 'n/a'} min=${faceMin} facesSynced=${facesSynced}`,
  )
  if (/plaza-photosphere/.test(stillSrc) || /plaza-photosphere/.test(videoSrc)) {
    console.warn(
      '  WARNING: plaza-photosphere is a failed near-black pack — re-capture ramen-hq',
    )
  }
  if (/sample-equirect/.test(stillSrc)) {
    console.warn('  note: using package fixtures (offline). Set PORTFOLIO_ROOM for real ramen assets.')
  }
  return {
    stillDst,
    videoDst,
    stillSrc,
    videoSrc,
    facesSynced,
    measuredFacePx,
    faceMin,
    quarantine: faceEval?.quarantine ?? false,
  }
}

function openBrowser(url) {
  if (process.env.SEVEN_DPS_NO_OPEN || process.env.DEMO_NO_OPEN) return
  const plat = process.platform
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open'
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* ignore */
  }
}

async function main() {
  if (!existsSync(join(DEMO, 'index.html'))) {
    throw new Error('missing demo/index.html')
  }
  const sync = syncRamenAssets()

  // Social / quality hard gate: optional DEMO_FACE_STRICT=1 fails process if faces quarantine
  // Default: warn + quarantine (server still runs for equirect demo)
  if (process.env.DEMO_FACE_STRICT === '1' && sync.quarantine) {
    console.error('DEMO_FACE_STRICT=1 and faces quarantined — exit 1')
    process.exit(1)
  }
  if (
    process.env.DEMO_FACE_STRICT === '1' &&
    sync.measuredFacePx != null &&
    sync.measuredFacePx < sync.faceMin
  ) {
    console.error(
      `DEMO_FACE_STRICT=1 face ${sync.measuredFacePx}px < ${sync.faceMin}px — exit 1`,
    )
    process.exit(1)
  }

  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    try {
      if (url === '/' || url === '/index.html') {
        const html = injectImportMap(readFileSync(join(DEMO, 'index.html'), 'utf8'))
        const body = Buffer.from(html, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
        })
        res.end(body)
        return
      }
      if (url.startsWith('/vendor/')) {
        const file = resolveVendor(url.slice('/vendor/'.length))
        if (!file) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        send(req, res, file)
        return
      }
      if (url.startsWith('/assets/')) {
        const file = join(ASSETS, url.slice('/assets/'.length))
        if (!file.startsWith(ASSETS) || !existsSync(file)) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        send(req, res, file)
        return
      }
      res.writeHead(404)
      res.end('not found')
    } catch (e) {
      res.writeHead(500)
      res.end(String(e.message || e))
    }
  })

  const port = await listenFree(server, PORT)
  const url = `http://127.0.0.1:${port}/`
  console.log('')
  console.log('4dps ramen demo')
  console.log('  ', url)
  console.log('  dim: 3D | 4D')
  console.log('  view: Sphere (Gallery ball) | Immersive (inside PSV, upright)')
  console.log('  deep link: ?dim=3d|4d&view=sphere|immersive')
  console.log('  Ctrl+C to stop')
  openBrowser(url)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
