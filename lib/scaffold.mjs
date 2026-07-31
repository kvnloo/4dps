import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { printPlan } from './adapter.mjs'

/**
 * Scaffold shots/7dps/<stamp> with README + manifest.
 * Capture stays in the host project — this only prepares the pack folder.
 */
export function scaffoldRun(adapter) {
  printPlan(adapter)

  const root = adapter.projectRoot
  if (!existsSync(root)) {
    throw new Error(`projectRoot missing: ${root}`)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = join(root, adapter.outDir || 'shots/7dps', stamp)
  mkdirSync(join(outDir, 'stills'), { recursive: true })
  mkdirSync(join(outDir, 'photosphere'), { recursive: true })
  mkdirSync(join(outDir, '4d', 'frames'), { recursive: true })

  writeFileSync(
    join(outDir, 'README.md'),
    [
      `# 7DPS — ${adapter.id}`,
      '',
      `Stamp: \`${stamp}\``,
      '',
      '## Checklist',
      '',
      '- [ ] Camera plan (9 stills + photosphere origin + 4D orbit)',
      '- [ ] Stills → `stills/01..09-*.png`',
      '- [ ] 3D photosphere → `photosphere/equirect.png`',
      '- [ ] 4D frames → `4d/frames/` + `7dps encode-4d`',
      '- [ ] `7dps grid --dir stills` → `preview.png`',
      '- [ ] Optional: `7dps view 3d|4d`',
      '',
      'See `skills/7dps/SKILL.md`.',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        kind: '7dps-pack',
        version: 1,
        adapter: adapter.id,
        stamp,
        outDir,
        viewers: {
          '3d': '@photo-sphere-viewer/core',
          '4d': '@photo-sphere-viewer/equirectangular-video-adapter',
        },
        note: 'Agent fills camera plan + captures; CLI does grid / encode / view.',
      },
      null,
      2,
    ),
  )

  console.log('')
  console.log('Scaffolded:', outDir)
  if (adapter.scripts?.preview) console.log('Host stills:', adapter.scripts.preview)
  if (adapter.scripts?.photosphere) console.log('Host photosphere:', adapter.scripts.photosphere)
  return outDir
}
