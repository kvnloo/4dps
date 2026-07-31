import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Package root (…/7dps) */
export const ROOT = resolve(__dirname, '..')

/**
 * Resolve a path: absolute as-is; relative from `base` (default package root).
 * Supports ${ENV}, ${ENV:-default}, and $ENV.
 */
export function resolveFrom(base, p) {
  if (!p) return base
  if (isAbsolute(p)) return p
  const expanded = String(p).replace(
    /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}|\$([A-Z0-9_]+)/g,
    (_, keyBrace, def, keySimple) => {
      const key = keyBrace || keySimple
      const val = process.env[key]
      if (val != null && val !== '') return val
      return def != null ? def : ''
    },
  )
  if (!expanded) return base
  if (isAbsolute(expanded)) return expanded
  return resolve(base, expanded)
}

export function adaptersDir() {
  return join(ROOT, 'adapters')
}
