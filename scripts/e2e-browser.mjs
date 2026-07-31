#!/usr/bin/env node
/**
 * Real browser E2E for PSV 3D + 4D.
 * Requires Chromium + playwright (devDependency) or PLAYWRIGHT from host.
 * Writes shots under fixtures/e2e-out/ and fails if canvas is black / missing.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createViewServer, listenFree } from '../lib/view.mjs'
import { ROOT } from '../lib/paths.mjs'

const outDir = join(ROOT, 'fixtures', 'e2e-out')
mkdirSync(outDir, { recursive: true })

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    // try host portfolio install
    try {
      return await import('/home/kvn/workspace/portfolio/demos/room/node_modules/playwright/index.mjs')
    } catch {
      throw new Error(
        'playwright not installed. Run: npm i -D playwright  (in 7dps) or set room playwright path',
      )
    }
  }
}

function meanLumaFromPng(file) {
  // Use magick if available
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
  // Must pass ?panorama= / ?video= — without it PSV never mounts a canvas
  const url = `http://127.0.0.1:${port}/?${query}`
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    console.log(`→ browser ${mode}`, url)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    // wait for canvas
    await page.waitForSelector('canvas', { timeout: 30000 })
    // PSV may take a moment
    await page.waitForTimeout(mode === '4d' ? 3500 : 2000)
    // try play video if 4d
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

    // canvas presence
    const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
    if (!hasCanvas) throw new Error(`${mode}: no canvas`)

    const mean = await meanLumaFromPng(file)
    if (mean != null && mean < 0.01) {
      throw new Error(`${mode}: screenshot nearly black (mean=${mean})`)
    }
    // 4d sample may be dark equirect — only fail if totally black
    if (mean != null) console.log(`  mean luma=${mean.toFixed(4)}`)

    // extra: ensure no fatal page error text
    const bodyText = await page.locator('body').innerText()
    if (/cannot resolve|not found:|missing asset/i.test(bodyText)) {
      throw new Error(`${mode}: error text in page: ${bodyText.slice(0, 120)}`)
    }

    return { file, mean, url }
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
      'missing fixtures/sample-equirect.mp4 — run: node scripts/make-fixtures.mjs',
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
