// @vitest-environment node

import { spawn } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const activeChildren = new Set()

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

function startServe(environment = {}) {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  activeChildren.add(child)
  return { child, getOutput: () => output }
}

async function waitForExit(child, timeout = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode }
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serve process did not exit in time')), timeout)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

async function stopServe(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  const result = await waitForExit(child)
  activeChildren.delete(child)
  return result
}

async function waitForFrontend(url, child, getOutput, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`serve exited before frontend readiness\n${getOutput()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // The dev server is still starting.
    }
    await delay(100)
  }
  throw new Error(`frontend did not become reachable\n${getOutput()}`)
}

afterEach(async () => {
  await Promise.all([...activeChildren].map((child) => stopServe(child)))
})

describe('combined development runtime', () => {
  it('keeps the frontend reachable when the later server entrypoint is absent', async () => {
    const port = await findAvailablePort()
    const { child, getOutput } = startServe({ VITE_CLI_PORT: String(port) })

    const response = await waitForFrontend(`http://127.0.0.1:${port}/`, child, getOutput)
    expect(await response.text()).toContain('方舟参考视频生成')
    expect(getOutput()).toContain('server/index.js is not available; starting the frontend only')

    const result = await stopServe(child)
    expect(result.code).toBe(0)
  }, 20000)

  it('propagates the frontend child exit code instead of reporting success', async () => {
    const fakeBin = await mkdtemp(join(tmpdir(), 'ark-serve-test-'))
    const fakeNpm = join(fakeBin, 'npm')
    await writeFile(fakeNpm, '#!/bin/sh\nif [ "$2" = "dev:server" ]; then exit 0; fi\nsleep 1\nexit 7\n')
    await chmod(fakeNpm, 0o755)

    try {
      const { child } = startServe({ PATH: `${fakeBin}:${process.env.PATH}` })
      const result = await waitForExit(child)
      activeChildren.delete(child)
      expect(result.code).toBe(7)
    } finally {
      await rm(fakeBin, { recursive: true, force: true })
    }
  })
})
