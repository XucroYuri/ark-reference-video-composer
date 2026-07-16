import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const serverEntrypointLabel = process.env.SERVE_SERVER_ENTRYPOINT || 'server/index.js'
const serverEntrypoint = resolve(projectRoot, serverEntrypointLabel)
const services = []

if (existsSync(serverEntrypoint)) {
  services.push({ name: 'server', command: process.execPath, args: ['--watch', serverEntrypoint] })
} else {
  console.warn(`[serve] ${serverEntrypointLabel} is not available; starting the frontend only`)
}

services.push({ name: 'frontend', command: 'npm', args: ['run', 'dev:web'] })

const children = services.map(({ name, command, args }) => ({
  name,
  process: spawn(command, args, {
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
