import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const serverEntrypoint = new URL('../server/index.js', import.meta.url)
const services = []

if (existsSync(serverEntrypoint)) {
  services.push({ name: 'server', args: ['run', 'dev:server'] })
} else {
  console.warn('[serve] server/index.js is not available; starting the frontend only')
}

services.push({ name: 'frontend', args: ['run', 'dev:web'] })

const children = services.map(({ name, args }) => ({
  name,
  process: spawn('npm', args, {
    cwd: projectRoot,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
}))

let stopping = false

const terminate = (child, signal) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall back to the direct child when its process group is already gone.
    }
  }
  child.kill(signal)
}

const stop = (signal = 'SIGTERM', exitCode = 0) => {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) terminate(child.process, signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal, 0))
for (const child of children) {
  child.process.on('error', (error) => {
    if (stopping) return
    console.error(`[serve] failed to start ${child.name}: ${error.message}`)
    stop('SIGTERM', 1)
  })
  child.process.on('exit', (code, signal) => {
    if (stopping) return
    const exitCode = Number.isInteger(code) && code !== 0 ? code : 1
    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.error(`[serve] ${child.name} exited unexpectedly with ${reason}`)
    stop('SIGTERM', exitCode)
  })
}
