#!/usr/bin/env node
/**
 * Offline smoke test — no browser, no host capture.
 * Verifies CLI wiring, adapter load, grid, and encode when tools exist.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'bin/7dps.mjs')
const tmp = join(root, '.tmp-smoke')

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      // fallback so portfolio adapter resolves without a real project tree
      PORTFOLIO_ROOM: process.env.PORTFOLIO_ROOM || tmp,
    },
    ...opts,
  })
  return r
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// tiny 8×8 PNG (1×1 black expanded later via magick if present)
function writeTinyPng(path) {
  // Precomputed minimal 8x8 solid PNG via magick if available, else skip grid
  const r = spawnSync(
    'magick',
    ['-size', '64x36', 'xc:#224466', path],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    // fallback: copy nothing — grid test skipped
    return false
  }
  return true
}

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log('ok ', name)
  } catch (e) {
    failed++
    console.error('FAIL', name, '—', e.message)
  }
}

rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

check('help', () => {
  const r = run(['--help'])
  assert(r.status === 0, `exit ${r.status}`)
  assert(/7dps/.test(r.stdout), 'help text missing')
})

check('list adapters via help', () => {
  const r = run(['help'])
  assert(r.status === 0, `exit ${r.status}`)
  assert(/example/.test(r.stdout), 'example adapter not listed')
})

check('plan example', () => {
  const r = run(['plan', '--adapter', 'example'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`)
  assert(/Agent checklist/.test(r.stdout), 'plan body missing')
})

check('run scaffold example', () => {
  const r = run(['run', '--adapter', 'example'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`)
  assert(/Scaffolded:/.test(r.stdout), 'scaffold message missing')
})

check('grid (magick)', () => {
  const stills = join(tmp, 'stills')
  mkdirSync(stills, { recursive: true })
  const a = join(stills, '01-a.png')
  const b = join(stills, '02-b.png')
  if (!writeTinyPng(a) || !writeTinyPng(b)) {
    console.log('skip grid — ImageMagick not available')
    return
  }
  const out = join(stills, 'preview.png')
  const r = run(['grid', '--dir', stills, '--out', out])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}\n${r.stdout}`)
  assert(existsSync(out), 'preview.png not written')
})

check('encode-4d (ffmpeg)', () => {
  const frames = join(tmp, 'frames')
  mkdirSync(frames, { recursive: true })
  const hasMagick = writeTinyPng(join(frames, 'f001.png')) && writeTinyPng(join(frames, 'f002.png'))
  if (!hasMagick) {
    console.log('skip encode — cannot make frames')
    return
  }
  const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (ff.status !== 0) {
    console.log('skip encode — ffmpeg not available')
    return
  }
  const out = join(tmp, 'equirect.mp4')
  const r = run(['encode-4d', '--frames', frames, '--out', out, '--fps', '6'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}\n${r.stdout}`)
  assert(existsSync(out), 'mp4 not written')
})

rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nsmoke ok')
