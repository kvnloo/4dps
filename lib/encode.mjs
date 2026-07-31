import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { run } from './run.mjs'

/**
 * Encode sorted image frames → H.264 mp4 (concat demuxer).
 * Used by both 4D equirect and drone perspective flythroughs.
 */
export async function encodeFrames(framesDir, outFile, fps = 24, opts = {}) {
  const dir = resolve(framesDir)
  if (!existsSync(dir)) throw new Error(`frames dir not found: ${dir}`)

  const frames = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_'))
    .sort()

  if (frames.length < 2) throw new Error(`need ≥2 frames in ${dir}`)

  const out = resolve(outFile)
  const list = join(dir, '_ffmpeg_list.txt')
  const esc = (p) => p.replace(/'/g, "'\\''")
  const duration = 1 / fps
  const crf = String(opts.crf ?? 18)

  const body =
    frames.map((f) => `file '${esc(join(dir, f))}'\nduration ${duration}`).join('\n') +
    `\nfile '${esc(join(dir, frames[frames.length - 1]))}'\n`

  writeFileSync(list, body)

  try {
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
      crf,
      '-movflags',
      '+faststart',
      out,
    ])
  } finally {
    rmSync(list, { force: true })
  }

  const label = opts.label || 'video'
  console.log(`wrote ${label}`, out)
  return out
}

/** Equirect frames → 4D photosphere mp4 (PSV video adapter). */
export async function encode4d(framesDir, outFile, fps = 24) {
  const dir = resolve(framesDir)
  const out = resolve(outFile || join(dir, '..', 'equirect.mp4'))
  return encodeFrames(dir, out, fps, { label: '4d equirect' })
}
