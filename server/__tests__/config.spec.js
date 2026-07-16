// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadConfig, loadEnvironment } from '../config.js'

describe('server configuration', () => {
  let rootDir

  afterEach(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true })
  })

  it('merges development then local then explicit process environment without mutation', async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'ark-config-'))
    await writeFile(join(rootDir, '.env.development'), [
      'APP_REAL_GENERATION_ENABLED=false',
      'ARK_MODEL=development-model',
      '',
    ].join('\n'))
    await writeFile(join(rootDir, '.env.local'), [
      'APP_REAL_GENERATION_ENABLED=true',
      'ARK_MODEL=local-model',
      '',
    ].join('\n'))
    const explicitEnv = {
      APP_REAL_GENERATION_ENABLED: 'false',
      ARK_MODEL: 'process-model',
    }

    const merged = loadEnvironment({ rootDir, processEnv: explicitEnv })

    expect(merged).toMatchObject(explicitEnv)
    expect(loadConfig(merged)).toMatchObject({
      realGenerationEnabled: false,
      arkModel: 'process-model',
      arkApiKey: '',
    })
    expect(explicitEnv).toEqual({
      APP_REAL_GENERATION_ENABLED: 'false',
      ARK_MODEL: 'process-model',
    })
  })

  it('accepts only TCP ports from 1 through 65535', () => {
    expect(loadConfig({ VITE_SERVER_PORT: '1' }).port).toBe(1)
    expect(loadConfig({ VITE_SERVER_PORT: '65535' }).port).toBe(65535)
    for (const value of ['0', '-1', '65536', 'not-a-number']) {
      expect(loadConfig({ VITE_SERVER_PORT: value }).port).toBe(8888)
    }
  })
})
