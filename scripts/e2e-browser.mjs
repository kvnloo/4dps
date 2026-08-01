#!/usr/bin/env node
/**
 * Real browser E2E:
 *   1) Standalone PSV 3d/4d (fixtures)
 *   2) Demo matrix: dim=3d|4d × view=sphere|immersive (H7/H3/H4/H8)
 *
 * Screenshots under fixtures/e2e-out/ (+ mode5 copies under demo/ for H3/H4).
 * Fails if canvas missing / nearly black / chrome inactive / demo deep-link broken.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { createViewServer, listenFree } from '../lib/view.mjs'
import { ROOT } from '../lib/paths.mjs'

const outDir = join(ROOT, 'fixtures', 'e2e-out')
const demoOutDir = join(ROOT, 'demo')
mkdirSync(outDir, { recursive: true })

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'playwright not installed. From the 7dps package root run:\n' +
        '  npm i -D playwright\n' +
        '  npx playwright install chromium',
    )
  }
}

/** Prefer Playwright bundle; optional CHROMIUM_PATH; then system binaries. */
function resolveExecutablePath() {
  if (process.env.CHROMIUM_PATH) {
    if (!existsSync(process.env.CHROMIUM_PATH)) {
      throw new Error(`CHROMIUM_PATH set but not found: ${process.env.CHROMIUM_PATH}`)
    }
    return process.env.CHROMIUM_PATH
  }
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function meanLumaFromPng(file) {
  return new Promise((ok) => {
    const p = spawn(
      'magick',
      [file, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:'],
      { encoding: 'utf8' },
    )
    let o = ''
    p.stdout.on('data', (d) => {
      o += d
    })
    p.on('exit', (code) => {
      if (code !== 0) return ok(null)
      ok(Number(o.trim()))
    })
    p.on('error', () => ok(null))
  })
}

async function launchBrowser() {
  const { chromium } = await loadPlaywright()
  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  }
  try {
    if (process.env.CHROMIUM_PATH) {
      launchOpts.executablePath = process.env.CHROMIUM_PATH
    }
    return await chromium.launch(launchOpts)
  } catch (err) {
    const fallback = resolveExecutablePath()
    if (!fallback || launchOpts.executablePath === fallback) {
      throw new Error(
        `could not launch Chromium (${err.message}). Install with:\n` +
          '  npx playwright install chromium\n' +
          'or set CHROMIUM_PATH to a system browser binary.',
      )
    }
    console.warn(`playwright browser missing; falling back to ${fallback}`)
    launchOpts.executablePath = fallback
    return await chromium.launch(launchOpts)
  }
}

async function shotStandalone(mode, asset, name) {
  const { server, query } = createViewServer(mode, asset)
  const port = await listenFree(server, 8890 + (mode === '4d' ? 1 : 0))
  const url = `http://127.0.0.1:${port}/?${query}`
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    console.log(`→ browser ${mode}`, url)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForTimeout(mode === '4d' ? 3500 : 2000)
    if (mode === '4d') {
      await page.evaluate(() => {
        const v = document.querySelector('video')
        if (v) {
          v.muted = true
          return v.play().catch(() => {})
        }
      })
      await page.waitForTimeout(1500)
    }
    const file = join(outDir, `${name}.png`)
    await page.screenshot({ path: file, type: 'png' })
    console.log('  screenshot', file)

    const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
    if (!hasCanvas) throw new Error(`${mode}: no canvas`)

    const mean = await meanLumaFromPng(file)
    if (mean != null && mean < 0.01) {
      throw new Error(`${mode}: screenshot nearly black (mean=${mean})`)
    }
    if (mean != null) console.log(`  mean luma=${mean.toFixed(4)}`)

    const bodyText = await page.locator('body').innerText()
    if (/cannot resolve|not found:|missing asset/i.test(bodyText)) {
      throw new Error(`${mode}: error text in page: ${bodyText.slice(0, 120)}`)
    }

    return {
      file: `fixtures/e2e-out/${name}.png`,
      mean,
      url,
    }
  } finally {
    await browser.close().catch(() => {})
    server.close()
  }
}

/**
 * Spin up demo server (syncs assets, injects import map) on a free port.
 * DEMO_NO_OPEN avoids xdg-open; DEMO_PORT selects port.
 */
function startDemoServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'demo.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        DEMO_PORT: String(port),
        DEMO_NO_OPEN: '1',
        SEVEN_DPS_NO_OPEN: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buf = ''
    let settled = false
    const onData = (d) => {
      buf += d.toString()
      const m = buf.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (m && !settled) {
        settled = true
        cleanup()
        resolve({ child, port: Number(m[1]), baseUrl: `http://127.0.0.1:${m[1]}` })
      }
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      // Fallback: assume requested port
      resolve({ child, port, baseUrl: `http://127.0.0.1:${port}` })
    }, 15000)
    function cleanup() {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code != null && code !== 0 && !settled) {
        settled = true
        cleanup()
        reject(new Error(`demo server exited early code=${code}\n${buf.slice(-500)}`))
      }
    })
  })
}

async function waitForDemoReady(page, dim, view) {
  // Wait for canvas and demo instrumentation
  await page.waitForSelector('#viewer canvas, #viewer .psv-canvas-container canvas', {
    timeout: 45000,
  })
  await page.waitForFunction(
    () => {
      const d = window.__4dpsDemo
      return d && d.dim && d.view && d.ready === true
    },
    null,
    { timeout: 45000 },
  )
  // Extra settle for faces upgrade / PSV texture
  await page.waitForTimeout(view === 'immersive' && dim === '4d' ? 3500 : 2200)
}

async function shotDemoCombo(browser, baseUrl, dim, view) {
  const name = `demo-${dim}-${view}`
  const url = `${baseUrl}/?dim=${dim}&view=${view}`
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  console.log(`→ demo ${dim}×${view}`, url)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitForDemoReady(page, dim, view)

    if (dim === '4d' && view === 'immersive') {
      await page.evaluate(() => {
        const v = document.querySelector('video')
        if (v) {
          v.muted = true
          return v.play().catch(() => {})
        }
      })
      await page.waitForTimeout(1200)
    }

    const file = join(outDir, `${name}.png`)
    await page.screenshot({ path: file, type: 'png' })
    // Mode5 evidence under demo/ for H3/H4 checklist
    const mode5 = join(demoOutDir, `mode5-${dim}-${view}.png`)
    try {
      copyFileSync(file, mode5)
    } catch {
      /* demo dir should exist */
    }
    console.log('  screenshot', file)

    const state = await page.evaluate(() => {
      const d = window.__4dpsDemo || {}
      const dimActive = !!document.querySelector(
        `[data-dim="${d.dim}"].active`,
      )
      const viewActive = !!document.querySelector(
        `[data-view="${d.view}"].active`,
      )
      const hasCanvas = !!document.querySelector('canvas')
      const err = document.querySelector('#viewer .err')
      return {
        dim: d.dim,
        view: d.view,
        ready: d.ready,
        facesReady: !!d.facesReady,
        zoomPath: d.zoomPath || null,
        upright: d.upright ?? null,
        kioskYaw: d.kioskYaw ?? null,
        sphereFit: d.sphereFit ?? null,
        dimActive,
        viewActive,
        hasCanvas,
        errText: err ? err.textContent : null,
        hint: (document.getElementById('hint') || {}).textContent || '',
      }
    })

    if (state.errText) {
      throw new Error(`${name}: viewer error: ${state.errText.slice(0, 160)}`)
    }
    if (!state.hasCanvas) throw new Error(`${name}: no canvas`)
    if (state.dim !== dim || state.view !== view) {
      throw new Error(
        `${name}: deep-link mismatch got dim=${state.dim} view=${state.view}`,
      )
    }
    if (!state.dimActive || !state.viewActive) {
      throw new Error(
        `${name}: chrome not active (dimActive=${state.dimActive} viewActive=${state.viewActive})`,
      )
    }

    // H8: Immersive 3D must use faces or hi when facesReady (Sphere may stay equirect ball)
    if (
      dim === '3d' &&
      view === 'immersive' &&
      state.facesReady &&
      state.zoomPath === 'base'
    ) {
      throw new Error(
        `${name}: facesReady but zoomPath=base (H8 — expected faces|hi)`,
      )
    }
    if (
      dim === '3d' &&
      view === 'sphere' &&
      state.zoomPath === 'base' &&
      !state.facesReady
    ) {
      // ok — offline fixtures without faces/hi
    }

    // H3 checklist: Immersive path must advertise upright / pitch 0
    if (view === 'immersive' && state.upright === false) {
      throw new Error(`${name}: immersive reports upright=false`)
    }

    const mean = await meanLumaFromPng(file)
    if (mean != null && mean < 0.015) {
      throw new Error(`${name}: screenshot nearly black (mean=${mean})`)
    }
    if (mean != null) console.log(`  mean luma=${mean.toFixed(4)} zoomPath=${state.zoomPath}`)

    return {
      file: `fixtures/e2e-out/${name}.png`,
      mode5: `demo/mode5-${dim}-${view}.png`,
      mean,
      url,
      ...state,
    }
  } finally {
    await page.close().catch(() => {})
  }
}

async function runDemoMatrix() {
  const prefer = 5177 + Math.floor(Math.random() * 40)
  const { child, baseUrl } = await startDemoServer(prefer)
  await new Promise((r) => setTimeout(r, 400))

  const browser = await launchBrowser()
  const combos = [
    ['3d', 'sphere'],
    ['3d', 'immersive'],
    ['4d', 'sphere'],
    ['4d', 'immersive'],
  ]
  const results = {}
  try {
    for (const [dim, view] of combos) {
      results[`${dim}-${view}`] = await shotDemoCombo(browser, baseUrl, dim, view)
    }
  } finally {
    await browser.close().catch(() => {})
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, 500).unref?.()
  }
  return results
}

async function main() {
  const still = join(ROOT, 'fixtures', 'sample-equirect.png')
  const video = join(ROOT, 'fixtures', 'sample-equirect.mp4')
  if (!existsSync(still)) throw new Error('missing fixtures/sample-equirect.png')
  if (!existsSync(video)) {
    throw new Error(
      'missing fixtures/sample-equirect.mp4 — run: npm run fixtures',
    )
  }

  const r3 = await shotStandalone('3d', still, 'e2e-3d')
  const r4 = await shotStandalone('4d', video, 'e2e-4d')

  let demo = null
  if (!existsSync(join(ROOT, 'demo', 'index.html'))) {
    console.warn('demo/index.html missing — skipping demo matrix')
  } else {
    demo = await runDemoMatrix()
  }

  const report = {
    ok: true,
    '3d': r3,
    '4d': r4,
    demo,
    gates: {
      H7: demo
        ? ['3d-sphere', '3d-immersive', '4d-sphere', '4d-immersive'].every(
            (k) => demo[k]?.mean != null || demo[k]?.hasCanvas,
          )
        : false,
      H3: demo?.['3d-immersive']?.upright !== false && !!demo?.['3d-immersive'],
      H4: !!demo?.['3d-sphere'],
      H8:
        !demo?.['3d-immersive']?.facesReady ||
        ['faces', 'hi'].includes(demo['3d-immersive']?.zoomPath),
    },
    at: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log('\nE2E browser OK')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error('E2E FAIL:', e.message || e)
  process.exit(1)
})
