/** Minimal argv helpers — no dependencies. */

export function argValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : null
}
