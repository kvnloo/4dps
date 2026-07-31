#!/usr/bin/env node
/**
 * Offline smoke test — no browser UI, no host capture.
 * Verifies CLI wiring, adapter load, grid, encode, drone paths,
 * and the PSV view HTTP path (import map, vendor, asset, range).
 *
 * Hard requirements: ImageMagick (`magick`) and ffmpeg on PATH.
 */
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createViewServer, listenFree, resolveVendor } from '../lib/view.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'bin/7dps.mjs')
const tmp = join(root, '.tmp-smoke')
const sample = join(root, 'fixtures/sample-equirect.png')
const DRONE_KINDS = ['orbit', 'flyover', 'spiral', 'pushin']
const PRESET_IDS = ['draft', 'social', 'print', 'archive']

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      // fallback so portfolio adapter resolves without a real project tree
      PORTFOLIO_ROOM: process.env.PORTFOLIO_ROOM || tmp,
      SEVEN_DPS_NO_OPEN: '1',
    },
    ...opts,
  })
  return r
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function requireTool(name, args = ['-version']) {
  const r = spawnSync(name, args, { encoding: 'utf8' })
  if (r.error?.code === 'ENOENT' || r.status !== 0) {
    throw new Error(
      `required system tool missing or broken: ${name}. Install ImageMagick + ffmpeg and ensure they are on PATH.`,
    )
  }
}

function writeTinyPng(path) {
  const r = spawnSync(
    'magick',
    ['-size', '64x36', 'xc:#224466', path],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`magick failed writing ${path}: ${r.stderr || r.stdout}`)
  }
}

function httpGet(port, path, headers = {}) {
  return new Promise((ok, fail) => {
    import('node:http')
      .then(({ default: http }) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path,
            method: 'GET',
            headers,
          },
          (res) => {
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              ok({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks),
              })
            })
          },
        )
        req.on('error', fail)
        req.end()
      })
      .catch(fail)
  })
}

let failed = 0
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('ok ', name)
    })
    .catch((e) => {
      failed++
      console.error('FAIL', name, '—', e.message)
    })
}

rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

await check('system deps (magick + ffmpeg)', () => {
  requireTool('magick', ['-version'])
  requireTool('ffmpeg', ['-version'])
})

await check('help', () => {
  const r = run(['--help'])
  assert(r.status === 0, `exit ${r.status}`)
  assert(/7dps/.test(r.stdout), 'help text missing')
})

await check('list adapters via help', () => {
  const r = run(['help'])
  assert(r.status === 0, `exit ${r.status}`)
  assert(/example/.test(r.stdout), 'example adapter not listed')
})

await check('plan example', () => {
  const r = run(['plan', '--adapter', 'example'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`)
  assert(/Agent checklist/.test(r.stdout), 'plan body missing')
})

await check('run scaffold example', () => {
  const r = run(['run', '--adapter', 'example'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`)
  assert(/Scaffolded:/.test(r.stdout), 'scaffold message missing')
})

await check('grid (magick)', () => {
  const stills = join(tmp, 'stills')
  mkdirSync(stills, { recursive: true })
  const a = join(stills, '01-a.png')
  const b = join(stills, '02-b.png')
  writeTinyPng(a)
  writeTinyPng(b)
  const out = join(stills, 'preview.png')
  const r = run(['grid', '--dir', stills, '--out', out])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}\n${r.stdout}`)
  assert(existsSync(out), 'preview.png not written')
  assert(!existsSync(join(stills, '_7dps_cells')), 'temp _7dps_cells left behind')
})

await check('encode-4d (ffmpeg)', () => {
  const frames = join(tmp, 'frames')
  mkdirSync(frames, { recursive: true })
  writeTinyPng(join(frames, 'f001.png'))
  writeTinyPng(join(frames, 'f002.png'))
  const out = join(tmp, 'equirect.mp4')
  const r = run(['encode-4d', '--frames', frames, '--out', out, '--fps', '6'])
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}\n${r.stdout}`)
  assert(existsSync(out), 'mp4 not written')
  assert(!existsSync(join(frames, '_ffmpeg_list.txt')), 'temp _ffmpeg_list.txt left behind')
})

await check('resolveVendor three + psv', () => {
  assert(resolveVendor('three/build/three.module.js'), 'three not resolvable')
  assert(
    resolveVendor('@photo-sphere-viewer/core/index.module.js'),
    'psv core not resolvable',
  )
})

await check('view 3d HTTP (import map + vendor + asset)', async () => {
  assert(existsSync(sample), `missing fixture ${sample}`)
  const { server } = createViewServer('3d', sample)
  const port = await listenFree(server, 18765)
  try {
    const index = await httpGet(port, '/?panorama=/sample-equirect.png')
    assert(index.status === 200, `index status ${index.status}`)
    const html = index.body.toString('utf8')
    assert(/importmap/.test(html), 'import map missing from index HTML')
    assert(
      /\/vendor\/three\/build\/three\.module\.js/.test(html),
      'three import map target missing',
    )
    assert(
      /\/vendor\/@photo-sphere-viewer\/core\/index\.module\.js/.test(html),
      'viewer should load PSV from /vendor',
    )

    const three = await httpGet(port, '/vendor/three/build/three.module.js')
    assert(three.status === 200, `three status ${three.status}`)
    assert(three.body.length > 1000, 'three module too small')

    const psv = await httpGet(
      port,
      '/vendor/@photo-sphere-viewer/core/index.module.js',
    )
    assert(psv.status === 200, `psv status ${psv.status}`)
    assert(/from ["']three["']/.test(psv.body.toString('utf8')), 'psv should bare-import three')

    const asset = await httpGet(port, '/sample-equirect.png')
    assert(asset.status === 200, `asset status ${asset.status}`)
    assert(asset.headers['accept-ranges'] === 'bytes', 'Accept-Ranges missing on asset')
    assert(asset.body[0] === 0x89 && asset.body[1] === 0x50, 'asset not a PNG')

    const ranged = await httpGet(port, '/sample-equirect.png', {
      Range: 'bytes=0-3',
    })
    assert(ranged.status === 206, `range status ${ranged.status}`)
    assert(ranged.body.length === 4, `range length ${ranged.body.length}`)
    assert(
      /bytes 0-3\//.test(ranged.headers['content-range'] || ''),
      `bad content-range ${ranged.headers['content-range']}`,
    )
  } finally {
    await new Promise((r) => server.close(r))
  }
})

await check('view free-port fallback', async () => {
  assert(existsSync(sample), `missing fixture ${sample}`)
  const a = createViewServer('3d', sample)
  const portA = await listenFree(a.server, 18780)
  try {
    const b = createViewServer('3d', sample)
    const portB = await listenFree(b.server, portA)
    try {
      assert(portB !== portA, `expected different ports, got ${portA} twice`)
      const res = await httpGet(portB, '/')
      assert(res.status === 200, `fallback server status ${res.status}`)
    } finally {
      await new Promise((r) => b.server.close(r))
    }
  } finally {
    await new Promise((r) => a.server.close(r))
  }
})

await check('presets draft/social/print/archive', () => {
  const r = run(['presets'])
  assert(r.status === 0, `exit ${r.status}`)
  for (const id of PRESET_IDS) {
    assert(new RegExp(id).test(r.stdout), `${id} preset missing from list`)
    const p = run(['preset', id])
    assert(p.status === 0, `preset ${id} exit ${p.status}: ${p.stderr}`)
    const j = JSON.parse(p.stdout)
    assert(j.id === id, `preset ${id} id mismatch`)
    assert(typeof j.quality?.dpr === 'number', `preset ${id} missing quality.dpr`)
    assert(typeof j.quality?.width === 'number', `preset ${id} missing quality.width`)
  }
  const social = JSON.parse(run(['preset', 'social']).stdout)
  assert(social.quality.dpr === 2, 'social dpr should be 2')
})

await check('drone-path all kinds + encode-drone', () => {
  for (const kind of DRONE_KINDS) {
    const pathFile = join(tmp, `drone-path-${kind}.json`)
    const r = run([
      'drone-path',
      '--out',
      pathFile,
      '--kind',
      kind,
      '--frames',
      '12',
    ])
    assert(r.status === 0, `drone-path ${kind} exit ${r.status}: ${r.stderr}`)
    assert(existsSync(pathFile), `path.json missing for ${kind}`)
    const body = JSON.parse(readFileSync(pathFile, 'utf8'))
    assert(body.path === kind, `expected path=${kind}, got ${body.path}`)
    assert(Array.isArray(body.keyframes) && body.keyframes.length === 12, `bad keyframes for ${kind}`)
    assert(body.keyframes[0].position?.length === 3, `keyframe position missing for ${kind}`)
  }
  const frames = join(tmp, 'drone-frames')
  mkdirSync(frames, { recursive: true })
  writeTinyPng(join(frames, 'd001.png'))
  writeTinyPng(join(frames, 'd002.png'))
  const out = join(tmp, 'drone.mp4')
  const e = run(['encode-drone', '--frames', frames, '--out', out, '--fps', '6'])
  assert(e.status === 0, `encode-drone exit ${e.status}: ${e.stderr}`)
  assert(existsSync(out), 'drone.mp4 missing')
})

await check('view 4d HTTP (video adapter + mp4 range)', async () => {
  const mp4 = join(root, 'fixtures/sample-equirect.mp4')
  assert(existsSync(mp4), 'missing fixtures/sample-equirect.mp4 — run npm run fixtures')
  const { server } = createViewServer('4d', mp4)
  const port = await listenFree(server, 18790)
  try {
    const index = await httpGet(port, '/?video=/sample-equirect.mp4')
    assert(index.status === 200, `index ${index.status}`)
    const html = index.body.toString('utf8')
    assert(/importmap/.test(html), '4d import map missing')
    assert(
      /equirectangular-video-adapter/.test(html),
      '4d viewer missing video adapter',
    )
    const adapter = await httpGet(
      port,
      '/vendor/@photo-sphere-viewer/equirectangular-video-adapter/index.module.js',
    )
    assert(adapter.status === 200, `adapter ${adapter.status}`)
    const asset = await httpGet(port, '/sample-equirect.mp4')
    assert(asset.status === 200, `mp4 ${asset.status}`)
    assert(asset.headers['content-type']?.includes('video/mp4'), 'content-type mp4')
    const ranged = await httpGet(port, '/sample-equirect.mp4', {
      Range: 'bytes=0-1023',
    })
    assert(ranged.status === 206, `range ${ranged.status}`)
    assert(ranged.body.length === 1024, `range len ${ranged.body.length}`)
  } finally {
    await new Promise((r) => server.close(r))
  }
})

rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nsmoke ok')
