// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { normalizeRemoteMediaUrl, RemoteMediaUrlError } from '../remoteUrl.js'

describe('normalizeRemoteMediaUrl', () => {
  it.each([
    'http://images.example.test/a.png',
    'https://user:pass@images.example.test/a.png',
    'https://localhost/a.png',
    'https://service.local/a.png',
    'https://127.0.0.1/a.png',
    'https://[::1]/a.png',
    'https://images.example.test:443/a.png',
    'https://images.example.test:444/a.png',
    String.raw`https:\\images.example.test:443\a.png`,
    String.raw`https:/\images.example.test:443/a.png`,
    `https://images.example.test/${'a'.repeat(4096)}`,
  ])('rejects remote media URL %s', (value) => {
    expect(() => normalizeRemoteMediaUrl(value)).toThrow(RemoteMediaUrlError)
  })

  it('normalizes a public HTTPS URL without fetching it', () => {
    expect(normalizeRemoteMediaUrl('https://images.example.test/a%20b.png')).toBe(
      'https://images.example.test/a%20b.png',
    )
  })
})
