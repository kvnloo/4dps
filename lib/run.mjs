import { spawn } from 'node:child_process'

/** Spawn a process; inherit stdio; reject on non-zero exit. */
export function run(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts })
    child.on('error', fail)
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`)),
    )
  })
}

/** Capture stdout as string (for identify / version probes). */
export function runCapture(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      ...opts,
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += d
    })
    child.stderr?.on('data', (d) => {
      err += d
    })
    child.on('error', fail)
    child.on('exit', (code) => {
      if (code === 0) ok(out)
      else fail(new Error(`${cmd} exited ${code}: ${err || out}`))
    })
  })
}
