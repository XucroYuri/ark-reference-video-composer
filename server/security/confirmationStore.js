import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

function digest(value) {
  return createHash('sha256').update(String(value ?? '')).digest()
}

function tokenKey(token) {
  return digest(token).toString('hex')
}

export function createConfirmationStore({
  ttlMs = 300_000,
  maxEntries = 1_000,
  clock = Date.now,
  idFactory = randomUUID,
} = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError('maxEntries must be a positive integer')
  }
  const tokens = new Map()

  const prune = (now) => {
    for (const [key, entry] of tokens) {
      if (entry.expiresAt <= now) tokens.delete(key)
    }
    while (tokens.size >= maxEntries) {
      tokens.delete(tokens.keys().next().value)
    }
  }

  return {
    issue(payloadHash) {
      const now = clock()
      prune(now)
      const token = idFactory()
      tokens.set(tokenKey(token), {
        payloadHash: digest(payloadHash),
        expiresAt: now + ttlMs,
      })
      return token
    },
    consume(token, payloadHash) {
      const key = tokenKey(token)
      const entry = tokens.get(key)
      tokens.delete(key)
      const submittedHash = digest(payloadHash)
      return Boolean(
        entry
        && entry.expiresAt > clock()
        && timingSafeEqual(entry.payloadHash, submittedHash),
      )
    },
  }
}
