#!/usr/bin/env node
/**
 * Real browser E2E for PSV 3D + 4D.
 *
 * Browser path (first match):
 *   1. CHROMIUM_PATH env (explicit override)
 *   2. Playwright-managed Chromium (`npx playwright install chromium`)
 *   3. Common system locations (chromium / google-chrome)
 *
 * Install e2e deps:
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Writes screenshots under fixtures/e2e-out/ (gitignored) and fails if canvas is black/missing.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { createViewServer, listenFree } from '../lib/view.mjs'
import { ROOT } from '../lib/paths.mjs'

const outDir = join(ROOT, 'fixtures', 'e2e-out')
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
  // Only used as last resort if Playwright's own browser is missing.
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

async function shotMode(mode, asset, name) {
  const { chromium } = await loadPlaywright()
  const { server, query } = createViewServer(mode, asset)
  const port = await listenFree(server, 8890 + (mode === '4d' ? 1 : 0))
  const url = `http://127.0.0.1:${port}/?${query}`

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

  // Prefer Playwright-managed browser (no executablePath).
  // Only set executablePath when CHROMIUM_PATH is set, or as fallback after
  // Playwright's default launch fails (handled below).
  let browser
  try {
    if (process.env.CHROMIUM_PATH) {
      launchOpts.executablePath = process.env.CHROMIUM_PATH
    }
    browser = await chromium.launch(launchOpts)
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
    browser = await chromium.launch(launchOpts)
  }

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

    // Relative path in report so pack/CI logs are machine-portable
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

async function main() {
  const still = join(ROOT, 'fixtures', 'sample-equirect.png')
  const video = join(ROOT, 'fixtures', 'sample-equirect.mp4')
  if (!existsSync(still)) throw new Error('missing fixtures/sample-equirect.png')
  if (!existsSync(video)) {
    throw new Error(
      'missing fixtures/sample-equirect.mp4 — run: npm run fixtures',
    )
  }

  const r3 = await shotMode('3d', still, 'e2e-3d')
  const r4 = await shotMode('4d', video, 'e2e-4d')

  const report = {
    ok: true,
    '3d': r3,
    '4d': r4,
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
