import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { run, runCapture } from './run.mjs'

/**
 * Build a uniform preview grid from PNG stills via ImageMagick.
 * Portrait frames are letterboxed into landscape cells.
 * Temp cells under `_7dps_cells/` are always removed.
 */
export async function grid(dir, out) {
  const abs = resolve(dir)
  if (!existsSync(abs)) throw new Error(`dir not found: ${abs}`)

  const files = readdirSync(abs)
    .filter((f) => /\.png$/i.test(f) && !/^preview/i.test(f) && !f.startsWith('_'))
    .sort()
    .map((f) => join(abs, f))

  if (!files.length) throw new Error(`no png stills in ${abs}`)

  const outPath = resolve(out || join(abs, 'preview.png'))
  let cellW = 1920
  let cellH = 1080

  try {
    const id = await runCapture('identify', ['-format', '%w %h', files[0]])
    const [w, h] = id.trim().split(/\s+/).map(Number)
    if (w > 0 && h > 0) {
      // Prefer landscape cell: if first still is portrait, use a landscape box
      if (h > w) {
        cellW = h
        cellH = w
      } else {
        cellW = w
        cellH = h
      }
    }
  } catch {
    /* keep defaults when identify missing */
  }

  const n = files.length
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const gap = 48

  console.log(`montage ${n} stills → ${cols}×${rows} @ ${cellW}×${cellH} → ${outPath}`)

  const tmp = join(abs, '_7dps_cells')
  mkdirSync(tmp, { recursive: true })
  const cells = []

  try {
    for (let i = 0; i < files.length; i++) {
      const cell = join(tmp, `${String(i).padStart(2, '0')}.png`)
      await run('magick', [
        files[i],
        '-background',
        '#050308',
        '-gravity',
        'center',
        '-extent',
        `${cellW}x${cellH}`,
        cell,
      ])
      cells.push(cell)
    }

    await run('magick', [
      'montage',
      ...cells,
      '-tile',
      `${cols}x${rows}`,
      '-geometry',
      `${cellW}x${cellH}+${gap}+${gap}`,
      '-background',
      '#050308',
      outPath,
    ])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log('wrote', outPath)
  return outPath
}
