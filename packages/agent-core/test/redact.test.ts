import { describe, expect, it } from 'vite-plus/test'
import { redact, previewText, safePreview } from '../src/redact.js'

describe('redact', () => {
  it('redacts sk- style API keys', () => {
    const { text, hits } = redact('key is sk-abc123def456ghi789jkl012mno')
    expect(text).toContain('[REDACTED:API_KEY]')
    expect(text).not.toContain('sk-abc')
    expect(hits).toEqual([{ type: 'API_KEY', count: 1 }])
  })

  it('redacts GitHub personal access tokens (ghp_)', () => {
    const { text, hits } = redact('token: ghp_abcdefghijklmnopqrstuvwxyz1234')
    expect(text).toContain('[REDACTED:GITHUB_TOKEN]')
    expect(text).not.toContain('ghp_')
    expect(hits).toEqual([{ type: 'GITHUB_TOKEN', count: 1 }])
  })

  it('redacts github_pat_ tokens', () => {
    const { text } = redact('pat: github_pat_abcdefghijklmnopqrstuvwxyz1234')
    expect(text).toContain('[REDACTED:GITHUB_TOKEN]')
  })

  it('redacts Bearer tokens', () => {
    // Standalone Bearer token (not inside Authorization header)
    const { text, hits } = redact('token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')
    expect(text).toContain('[REDACTED:BEARER_TOKEN]')
    expect(hits.some((h) => h.type === 'BEARER_TOKEN')).toBe(true)
  })

  it('redacts Authorization header with Bearer token', () => {
    // When Authorization + Bearer both match, both get redacted
    const { text, hits } = redact('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')
    // Bearer gets redacted first, then AUTH_HEADER wraps the result
    expect(text).toContain('[REDACTED')
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('redacts Authorization header values', () => {
    const { text } = redact('Authorization: Basic dXNlcjpwYXNz')
    expect(text).toContain('[REDACTED:AUTH_HEADER]')
  })

  it('redacts Cookie headers', () => {
    const { text } = redact('Cookie: session=abc123; token=xyz789')
    expect(text).toContain('[REDACTED:COOKIE]')
    expect(text).not.toContain('session=abc123')
  })

  it('redacts Set-Cookie headers', () => {
    const { text } = redact('Set-Cookie: id=a3fWa; Expires=Thu, 21 Oct 2025')
    expect(text).toContain('[REDACTED:COOKIE]')
  })

  it('redacts PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'
    const { text, hits } = redact(`key:\n${pem}\nend`)
    expect(text).toContain('[REDACTED:PRIVATE_KEY]')
    expect(text).not.toContain('MIIEpAIBAAKCAQEA')
    expect(hits).toEqual([{ type: 'PRIVATE_KEY', count: 1 }])
  })

  it('does not redact normal text', () => {
    const input = 'Hello world, this is a normal message with no secrets.'
    const { text, hits } = redact(input)
    expect(text).toBe(input)
    expect(hits).toEqual([])
  })

  it('does not redact short hashes or normal identifiers', () => {
    const input = 'commit abc123def, file sha256:deadbeef0123456789'
    const { text, hits } = redact(input)
    expect(text).toBe(input)
    expect(hits).toEqual([])
  })

  it('does not redact sk- prefix shorter than 20 chars', () => {
    const input = 'sk-short'
    const { text } = redact(input)
    expect(text).toBe(input)
  })

  it('handles multiple secrets in one text', () => {
    const input = 'key1: sk-aaaabbbbccccddddeeeeffffgggg key2: ghp_aaaabbbbccccddddeeeeffffgggg'
    const { text, hits } = redact(input)
    expect(text).toContain('[REDACTED:API_KEY]')
    expect(text).toContain('[REDACTED:GITHUB_TOKEN]')
    expect(hits).toHaveLength(2)
  })
})

describe('previewText', () => {
  it('returns short text unchanged', () => {
    expect(previewText('hello', 100)).toBe('hello')
  })

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(200)
    const result = previewText(long, 50)
    expect(result).toHaveLength(51) // 50 + '…'
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('safePreview', () => {
  it('redacts and truncates', () => {
    const input = 'key: sk-aaaabbbbccccddddeeeeffffgggg ' + 'x'.repeat(3000)
    const { text, hits } = safePreview(input, 100)
    expect(text).toContain('[REDACTED:API_KEY]')
    expect(text.length).toBeLessThanOrEqual(101)
    expect(hits).toHaveLength(1)
  })
})
