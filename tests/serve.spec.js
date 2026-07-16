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
      throw new Error(`serve 在前端就绪前已退出\n${getOutput()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // 开发服务器仍在启动中，继续短轮询。
    }
    await delay(100)
  }
  throw new Error(`前端服务在超时时间内不可访问\n${getOutput()}`)
}

afterEach(async () => {
  await Promise.all([...activeChildren].map((child) => stopServe(child)))
})

describe('组合式本地开发运行时', () => {
  it('服务端入口缺失时仍保持前端可访问', async () => {
    const port = await findAvailablePort()
    const fixtureDir = await mkdtemp(join(tmpdir(), 'ark-missing-server-'))
    const missingEntrypoint = join(fixtureDir, 'server-entrypoint-that-does-not-exist.js')

    try {
      const { child, getOutput } = startServe({
        SERVE_SERVER_ENTRYPOINT: missingEntrypoint,
        VITE_CLI_PORT: String(port),
      })

      const response = await waitForFrontend(`http://127.0.0.1:${port}/`, child, getOutput)
      expect(await response.text()).toContain('方舟参考视频生成')
      expect(getOutput()).toContain(`未找到 ${missingEntrypoint}，仅启动前端`)

      const result = await stopServe(child)
      expect(result.code).toBe(0)
    } finally {
      await rm(fixtureDir, { recursive: true, force: true })
    }
  }, 20000)

  it('前端子进程异常退出时透传退出码而不是误报成功', async () => {
    const fakeBin = await mkdtemp(join(tmpdir(), 'ark-serve-test-'))
    const fakeNpm = join(fakeBin, 'npm')
    await writeFile(fakeNpm, '#!/bin/sh\nif [ "$2" = "dev:server" ]; then exit 0; fi\nsleep 1\nexit 7\n')
    await chmod(fakeNpm, 0o755)

    try {
      const { child } = startServe({
        PATH: `${fakeBin}:${process.env.PATH}`,
        SERVE_SERVER_ENTRYPOINT: join(fakeBin, 'server-entrypoint-that-does-not-exist.js'),
      })
      const result = await waitForExit(child)
      activeChildren.delete(child)
      expect(result.code).toBe(7)
    } finally {
      await rm(fakeBin, { recursive: true, force: true })
    }
  })
})
