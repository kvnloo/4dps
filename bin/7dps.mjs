#!/usr/bin/env node
/**
 * 7dps — thin CLI for designer preview packs.
 *
 * Capture lives in the host project. This package: plan · grid · encode · view.
 *
 *   7dps plan --adapter <name>
 *   7dps run  --adapter <name>
 *   7dps grid --dir <stills> [--out preview.png]
 *   7dps encode-4d --frames <dir> [--out equirect.mp4] [--fps 24]
 *   7dps view 3d <equirect.png>
 *   7dps view 4d <equirect.mp4>
 */
import { loadAdapter, listAdapters, printPlan } from '../lib/adapter.mjs'
import { argValue } from '../lib/args.mjs'
import { grid } from '../lib/grid.mjs'
import { encode4d } from '../lib/encode.mjs'
import { view } from '../lib/view.mjs'
import { scaffoldRun } from '../lib/scaffold.mjs'

function help() {
  const adapters = listAdapters().join(', ') || '(add adapters/*.json)'
  console.log(`7dps — designer preview pack helpers

  plan --adapter <name>              Camera-plan checklist
  run  --adapter <name>              Scaffold shots/7dps/<stamp>
  grid --dir <stills> [--out path]   ImageMagick montage → preview.png
  encode-4d --frames <dir> [--out path] [--fps 24]
  view 3d <equirect.png>             Photo Sphere Viewer (still)
  view 4d <equirect.mp4>             Photo Sphere Viewer (video)

Adapters: ${adapters}
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
    printPlan(loadAdapter(argValue(argv, '--adapter') || 'example'))
    return
  }

  if (cmd === 'run') {
    scaffoldRun(loadAdapter(argValue(argv, '--adapter') || 'example'))
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

  if (cmd === 'view') {
    const mode = argv[1]
    const asset = argv[2]
    if (!mode || !asset) throw new Error('usage: 7dps view 3d|4d <asset>')
    await view(mode === '4d' ? '4d' : '3d', asset)
    return
  }

  throw new Error(`unknown command: ${cmd} (try --help)`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
