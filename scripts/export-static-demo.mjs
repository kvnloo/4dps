#!/usr/bin/env node
/**
 * Export shareable static demo (B12 / E5).
 *   DEMO_SYNC_ONLY via demo.mjs, then copy assets + vendor + rewritten index.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT } from '../lib/paths.mjs'

const out = resolve(process.argv[2] || join(ROOT, 'dist-demo'))
const DEMO = join(ROOT, 'demo')
const ASSETS = join(DEMO, 'assets')

const sync = spawnSync(process.execPath, [join(ROOT, 'scripts/demo.mjs')], {
  cwd: ROOT,
  env: { ...process.env, DEMO_SYNC_ONLY: '1', DEMO_NO_OPEN: '1' },
  encoding: 'utf8',
  timeout: 180000,
})
if (sync.status !== 0) {
  console.error(sync.stdout || '')
  console.error(sync.stderr || '')
  throw new Error(`demo sync failed (exit ${sync.status})`)
}
process.stdout.write((sync.stdout || '').split('\n').slice(-12).join('\n') + '\n')

if (!existsSync(join(ASSETS, 'ramen-equirect.png'))) {
  throw new Error('missing demo/assets/ramen-equirect.png after sync')
}

if (existsSync(out)) rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'vendor'), { recursive: true })
mkdirSync(join(out, 'assets'), { recursive: true })

const skipRe =
  /^(bug-|compare-|fix-|live-|now-|yaw-|sphere-|restored-|verify-|starwall|drag-|watch-|final-|fixed-|4d-t|demo-smoke|restore-)/

function copyAssets(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    if (skipRe.test(name)) continue
    const s = join(src, name)
    const d = join(dst, name)
    const st = statSync(s)
    if (st.isDirectory()) copyAssets(s, d)
    else cpSync(s, d)
  }
}
copyAssets(ASSETS, join(out, 'assets'))

const pkgs = [
  'three',
  '@photo-sphere-viewer/core',
  '@photo-sphere-viewer/autorotate-plugin',
  '@photo-sphere-viewer/equirectangular-video-adapter',
  '@photo-sphere-viewer/video-plugin',
]
for (const pkg of pkgs) {
  const nm = join(ROOT, 'node_modules', ...pkg.split('/'))
  if (!existsSync(nm)) throw new Error('missing node_modules/' + pkg)
  cpSync(nm, join(out, 'vendor', ...pkg.split('/')), { recursive: true })
}

let html = readFileSync(join(DEMO, 'index.html'), 'utf8')
html = html.split('/vendor/').join('./vendor/')
html = html.split("'/assets/").join("'./assets/")
html = html.split('"/assets/').join('"./assets/')
html = html.split('`/assets/').join('`./assets/')
html = html.split('(/assets/').join('(./assets/')
html = html.split("fetch('/assets/").join("fetch('./assets/")
html = html.split('fetch("/assets/').join('fetch("./assets/')

const imports = {
  three: './vendor/three/build/three.module.js',
  'three/addons/': './vendor/three/examples/jsm/',
  '@photo-sphere-viewer/core': './vendor/@photo-sphere-viewer/core/index.module.js',
  '@photo-sphere-viewer/autorotate-plugin':
    './vendor/@photo-sphere-viewer/autorotate-plugin/index.module.js',
  '@photo-sphere-viewer/equirectangular-video-adapter':
    './vendor/@photo-sphere-viewer/equirectangular-video-adapter/index.module.js',
  '@photo-sphere-viewer/video-plugin':
    './vendor/@photo-sphere-viewer/video-plugin/index.module.js',
}
const map = '<script type="importmap">\n' + JSON.stringify({ imports }, null, 2) + '\n</script>\n'
if (!html.includes('type="importmap"')) {
  html = html.replace(/<\/head>/i, map + '</head>')
}

writeFileSync(join(out, 'index.html'), html)
writeFileSync(
  join(out, 'embed.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>4dps embed · Kevin’s Ramen</title>
  <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style>
</head>
<body>
  <iframe src="./index.html?dim=4d&view=sphere" allow="autoplay; fullscreen; accelerometer; gyroscope" allowfullscreen loading="lazy" title="4dps ramen photosphere"></iframe>
</body>
</html>
`,
)
writeFileSync(
  join(out, 'package-snippet.html'),
  `<!-- portfolio embed -->
<iframe
  src="/4dps-demo/index.html?dim=4d&view=sphere"
  style="width:100%;aspect-ratio:16/10;border:0;border-radius:16px;background:#000"
  allow="autoplay; fullscreen; accelerometer; gyroscope"
  loading="lazy"
  title="Kevin's Ramen — 4D photosphere"
></iframe>
`,
)
writeFileSync(
  join(out, 'README.md'),
  `# 4dps static demo

\`\`\`bash
npx --yes serve -l 4177 .
# http://127.0.0.1:4177/?dim=4d&view=sphere
\`\`\`

Phone deep links: \`?dim=3d|4d&view=sphere|immersive\`

Embed: see embed.html / package-snippet.html.
`,
)

console.log(
  JSON.stringify(
    {
      ok: true,
      out,
      hasStill: existsSync(join(out, 'assets', 'ramen-equirect.png')),
      hasMp4: existsSync(join(out, 'assets', 'ramen-equirect.mp4')),
      hasFaces: existsSync(join(out, 'assets', 'faces', 'nz.png')),
      hasLevels: existsSync(join(out, 'assets', 'levels.json')),
      hasIndex: existsSync(join(out, 'index.html')),
    },
    null,
    2,
  ),
)
