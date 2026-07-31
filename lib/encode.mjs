import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { run } from './run.mjs'

/**
 * Encode sorted equirect frames (png/jpg) → H.264 mp4 for PSV video adapter.
 */
export async function encode4d(framesDir, outFile, fps = 24) {
  const dir = resolve(framesDir)
  if (!existsSync(dir)) throw new Error(`frames dir not found: ${dir}`)

  const frames = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_'))
    .sort()

  if (frames.length < 2) throw new Error(`need ≥2 frames in ${dir}`)

  const out = resolve(outFile || join(dir, '..', 'equirect.mp4'))
  const list = join(dir, '_ffmpeg_list.txt')
  const esc = (p) => p.replace(/'/g, "'\\''")
  const duration = 1 / fps

  const body =
    frames.map((f) => `file '${esc(join(dir, f))}'\nduration ${duration}`).join('\n') +
    `\nfile '${esc(join(dir, frames[frames.length - 1]))}'\n`

  writeFileSync(list, body)

  await run('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vsync',
    'vfr',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    out,
  ])

  console.log('wrote', out)
  return out
}
