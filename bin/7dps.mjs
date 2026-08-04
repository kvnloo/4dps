#!/usr/bin/env node
/**
 * 7dps — designer preview packs for 3D web scenes.
 *
 * Capture lives in the host. This package: plan · presets · grid · encode · drone · view.
 */
import { loadAdapter, listAdapters, printPlan } from '../lib/adapter.mjs'
import { argValue } from '../lib/args.mjs'
import { grid } from '../lib/grid.mjs'
import { encode4d } from '../lib/encode.mjs'
import { view } from '../lib/view.mjs'
import { scaffoldRun } from '../lib/scaffold.mjs'
import { listPresets, loadPreset, printPreset, printPresets } from '../lib/presets.mjs'
import { writeDronePath, encodeDrone } from '../lib/drone.mjs'

/** Parse "x,y,z" or "x y z" into a 3-number array; null if flag absent. */
function parseVec3(raw, flag) {
  if (raw == null || raw === '') return null
  const parts = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 3) {
    throw new Error(`${flag} expects three numbers as x,y,z (got ${JSON.stringify(raw)})`)
  }
  const nums = parts.map(Number)
  if (nums.some((n) => Number.isNaN(n))) {
    throw new Error(`${flag} expects numeric x,y,z (got ${JSON.stringify(raw)})`)
  }
  return nums
}

function help() {
  const adapters = listAdapters().join(', ') || '(add adapters/*.json)'
  const presets = listPresets().join(', ') || '(add presets/*.json)'
  console.log(`7dps — designer preview pack helpers

  plan --adapter <name> [--quality social]
  run  --adapter <name> [--quality social] [--drone orbit|flyover|spiral|pushin]
  presets                              List quality presets
  preset <id>                          Print one preset JSON
  grid --dir <stills> [--out path]
  encode-4d --frames <dir> [--out path] [--fps 24]
  drone-path --out path.json [--kind orbit] [--frames 48] [--radius 8] [--height 2.4]
             [--origin x,y,z] [--target x,y,z] [--fov 38]
  encode-drone --frames <dir> [--out drone.mp4] [--fps 24]
  view 3d <equirect.png>
  view 4d <equirect.mp4>

Adapters: ${adapters}
Presets:  ${presets}
Doctrine: skills/7dps/SKILL.md
`)
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] || 'help'

  if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
    help()
    return
  }

  if (cmd === 'plan') {
    const adapter = loadAdapter(argValue(argv, '--adapter') || 'example')
    printPlan(adapter)
    const q = argValue(argv, '--quality')
    if (q) {
      console.log('\n## Quality preset')
      printPreset(q)
    } else {
      console.log('\n## Quality presets')
      printPresets()
    }
    return
  }

  if (cmd === 'presets') {
    printPresets()
    return
  }

  if (cmd === 'preset') {
    const id = argv[1] || argValue(argv, '--id')
    if (!id) throw new Error('usage: 7dps preset <id>')
    printPreset(id)
    return
  }

  if (cmd === 'run') {
    scaffoldRun(loadAdapter(argValue(argv, '--adapter') || 'example'), {
      quality: argValue(argv, '--quality') || 'social',
      droneKind: argValue(argv, '--drone') || 'orbit',
    })
    return
  }

  if (cmd === 'grid') {
    const dir = argValue(argv, '--dir')
    if (!dir) throw new Error('--dir required')
    await grid(dir, argValue(argv, '--out'))
    return
  }

  if (cmd === 'encode-4d') {
    const frames = argValue(argv, '--frames')
    if (!frames) throw new Error('--frames required')
    await encode4d(frames, argValue(argv, '--out'), Number(argValue(argv, '--fps') || 24))
    return
  }

  if (cmd === 'drone-path') {
    const out = argValue(argv, '--out') || 'drone-path.json'
    const origin = parseVec3(argValue(argv, '--origin'), '--origin')
    const target = parseVec3(argValue(argv, '--target'), '--target')
    const opts = {
      kind: argValue(argv, '--kind') || 'orbit',
      frames: Number(argValue(argv, '--frames') || 48),
      radius: Number(argValue(argv, '--radius') || 8),
      height: Number(argValue(argv, '--height') || 2.4),
      fov: Number(argValue(argv, '--fov') || 38),
    }
    if (origin) opts.origin = origin
    if (target) opts.target = target
    writeDronePath(out, opts)
    return
  }

  if (cmd === 'encode-drone') {
    const frames = argValue(argv, '--frames')
    if (!frames) throw new Error('--frames required')
    await encodeDrone(frames, argValue(argv, '--out'), Number(argValue(argv, '--fps') || 24))
    return
  }

  if (cmd === 'view') {
    const mode = argv[1]
    const asset = argv[2]
    if (!mode || !asset) {
      throw new Error(
        'usage: 7dps view 3d|4d <asset>\n' +
          '  still:  7dps view 3d fixtures/sample-equirect.png\n' +
          '  video:  7dps view 4d fixtures/sample-equirect.mp4',
      )
    }
    if (mode !== '3d' && mode !== '4d') {
      throw new Error(`view mode must be 3d or 4d (got ${mode})`)
    }
    await view(mode, asset, {
      port: argValue(argv, '--port') || process.env.SEVEN_DPS_PORT,
    })
    return
  }

  throw new Error(`unknown command: ${cmd} (try --help)`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
