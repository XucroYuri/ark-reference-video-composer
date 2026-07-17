import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import router from '@/router/index'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tempDirectories = []

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' })
}

function createScannerFixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'ark-secret-scan-'))
  tempDirectories.push(directory)
  expect(run('git', ['init', '--quiet'], directory).status).toBe(0)

  const scannerSource = resolve(rootDir, 'scripts/check-secrets.mjs')
  const scannerTarget = resolve(directory, 'check-secrets.mjs')
  writeFileSync(scannerTarget, readFileSync(scannerSource, 'utf8'))
  writeFileSync(resolve(directory, 'safe.txt'), 'public reference fixture\n')
  expect(run('git', ['add', 'check-secrets.mjs', 'safe.txt'], directory).status).toBe(0)
  return directory
}

function trackAndScan(directory, file, content) {
  writeFileSync(resolve(directory, file), content)
  expect(run('git', ['add', file], directory).status).toBe(0)
  return run(process.execPath, ['check-secrets.mjs'], directory)
}

describe('application scaffold', () => {
  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('registers the migration-compatible hash route', () => {
    const route = router.getRoutes().find((item) => item.name === 'VideoGeneration')
    expect(route?.path).toBe('/video-generation')
  })

  it.each([
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
    '.github/workflows/ci.yml',
    'docs/api-conformance.md',
  ])('includes public repository file %s', (path) => {
    expect(existsSync(resolve(rootDir, path))).toBe(true)
  })

  it('declares MIT public repository metadata', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
    expect(pkg.private).not.toBe(true)
    expect(pkg.license).toBe('MIT')
    expect(pkg.repository.url).toContain('XucroYuri/ark-reference-video-composer')
  })

  it('rejects tracked secrets without echoing their values', () => {
    const directory = createScannerFixture()
    const secret = `fixture-${Date.now()}-private-value`
    const variable = ['ARK', 'API', 'KEY'].join('_')
    writeFileSync(resolve(directory, 'tracked.env'), `${variable}=${secret}\n`)
    expect(run('git', ['add', 'tracked.env'], directory).status).toBe(0)

    const result = run(process.execPath, ['check-secrets.mjs'], directory)

    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain('tracked.env')
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
  })

  it('ignores untracked local environments and the tracked example', () => {
    const directory = createScannerFixture()
    const variable = ['ARK', 'API', 'KEY'].join('_')
    writeFileSync(resolve(directory, '.env.local'), `${variable}=untracked-private-value\n`)
    const mixedCaseVariable = ['VITE', 'ARK', 'apiKey'].join('_')
    const authorization = ['Author', 'ization'].join('')
    const bearer = ['Bear', 'er'].join('')
    writeFileSync(resolve(directory, '.env.example'), `${variable}=documented-placeholder\n`)
    writeFileSync(
      resolve(directory, 'safe.env'),
      `${variable}=\n${mixedCaseVariable}=\n"${authorization}": "${bearer} [REDACTED]"\n`,
    )
    expect(run('git', ['add', '-f', '.env.example', 'safe.env'], directory).status).toBe(0)

    const result = run(process.execPath, ['check-secrets.mjs'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Secret scan passed')
  })

  it('rejects a mixed-case suffix on an exact VITE_ARK_ assignment prefix', () => {
    const directory = createScannerFixture()
    const frontendVariable = ['VITE', 'ARK', 'apiKey'].join('_')
    const secret = `frontend-${Date.now()}-private-value`
    const result = trackAndScan(directory, 'tracked.env', `${frontendVariable}=${secret}\n`)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('tracked.env')
    expect(output).not.toContain(secret)
  })

  it.each([
    ['unquoted', (key, bearer, value) => `${key}: ${bearer} ${value}\n`],
    ['single-quoted key and value', (key, bearer, value) => `'${key}': '${bearer} ${value}'\n`],
    ['double-quoted JSON-like key and value', (key, bearer, value) => `"${key}": "${bearer} ${value}"\n`],
    ['backtick-quoted key and value', (key, bearer, value) => `\`${key}\`: \`${bearer} ${value}\`\n`],
    ['single-quoted credential', (key, bearer, value) => `${key}: ${bearer} '${value}'\n`],
    ['double-quoted credential', (key, bearer, value) => `${key}: ${bearer} "${value}"\n`],
    ['backtick-quoted credential', (key, bearer, value) => `${key}: ${bearer} \`${value}\`\n`],
  ])('rejects an unredacted bearer header with %s', (_name, formatHeader) => {
    const directory = createScannerFixture()
    const authorization = ['Author', 'ization'].join('')
    const bearer = ['Bear', 'er'].join('')
    const secret = `bearer-${Date.now()}-private-value`
    const result = trackAndScan(
      directory,
      'tracked-header.txt',
      formatHeader(authorization, bearer, secret),
    )
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('tracked-header.txt')
    expect(output).not.toContain(secret)
  })

  it('fails closed on a tracked symlink without opening its ignored target', () => {
    const directory = createScannerFixture()
    const variable = ['ARK', 'API', 'KEY'].join('_')
    const secret = `symlink-${Date.now()}-private-value`
    writeFileSync(resolve(directory, '.env.local'), `${variable}=${secret}\n`)
    symlinkSync('.env.local', resolve(directory, 'tracked-link'))
    expect(run('git', ['add', 'tracked-link'], directory).status).toBe(0)

    const result = run(process.execPath, ['check-secrets.mjs'], directory)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('tracked-link')
    expect(output).toContain('tracked non-regular entry')
    expect(output).not.toContain(secret)
  })

  it('documents provisional task display before the first scheduled GET', () => {
    const english = readFileSync(resolve(rootDir, 'README.md'), 'utf8')
    const chinese = readFileSync(resolve(rootDir, 'README.zh-CN.md'), 'utf8')
    const conformance = readFileSync(resolve(rootDir, 'docs/api-conformance.md'), 'utf8')

    expect(english).toContain('first bounded GET occurs after 3 seconds while visible')
    expect(chinese).toContain('首次有界 GET 在页面可见时等待 3 秒')
    expect(conformance).toContain('first bounded GET follows the 3 s visible/10 s hidden schedule')
    expect(conformance).not.toContain('Immediate query after creation')
  })
})
