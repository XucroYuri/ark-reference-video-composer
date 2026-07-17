import { lstatSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const listed = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'buffer',
  maxBuffer: 16 * 1024 * 1024,
})

if (listed.status !== 0) {
  console.error('Secret scan failed: unable to list tracked files.')
  process.exit(2)
}

const trackedFiles = listed.stdout.toString('utf8').split('\0').filter(Boolean)
const excludedFiles = new Set(['.env.example'])
const rules = [
  {
    name: 'non-empty ARK_API_KEY assignment',
    pattern: /^[ \t]*(?:export[ \t]+)?ARK_API_KEY[ \t]*=[ \t]*(?![ \t]*(?:#.*)?$).+/m,
  },
  {
    name: 'client-exposed Ark variable assignment',
    pattern: /^[ \t]*(?:export[ \t]+)?VITE_ARK_[A-Za-z0-9_]*[ \t]*=[ \t]*(?![ \t]*(?:#.*)?$).+/m,
  },
  {
    name: 'unredacted bearer header',
    pattern: /["'`]?Authorization["'`]?[ \t]*:[ \t]*["'`]?[ \t]*Bearer[ \t]+["'`]?(?!\[REDACTED\]|<redacted>|\$\{|\{\{)[^\s"'`<>},;]+/i,
  },
]

function isBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192))
  if (sample.includes(0)) return true

  let controls = 0
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) controls += 1
  }
  return sample.length > 0 && controls / sample.length > 0.1
}

const findings = []
let scanned = 0
let binary = 0

for (const file of trackedFiles) {
  let stats
  try {
    stats = lstatSync(file)
  } catch {
    findings.push({ file, rule: 'tracked entry unavailable' })
    continue
  }
  if (!stats.isFile()) {
    findings.push({ file, rule: 'tracked non-regular entry' })
    continue
  }
  if (excludedFiles.has(file)) continue
  let content
  try {
    content = readFileSync(file)
  } catch {
    findings.push({ file, rule: 'tracked file unreadable' })
    continue
  }
  if (isBinary(content)) {
    binary += 1
    continue
  }
  scanned += 1
  const text = content.toString('utf8')
  for (const rule of rules) {
    if (rule.pattern.test(text)) findings.push({ file, rule: rule.name })
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed: ${findings.length} finding(s) in tracked text files.`)
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`)
  process.exit(1)
}

console.log(
  `Secret scan passed: ${scanned} tracked text file(s) checked; ${binary} binary file(s) skipped.`,
)
