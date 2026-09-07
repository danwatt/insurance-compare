import { parseState } from './state.ts'
import type { AppState } from './state.ts'
import type { Metric } from './calculator.ts'

type SharedData = { version: 1; state: AppState; metric: Metric }
type ShareResult =
  { kind: 'none' } | { kind: 'invalid' } | { kind: 'valid'; state: AppState; metric: Metric }

const maxPayloadLength = 250_000

// UTF-8 preserves accents, emoji, and other non-ASCII names and notes.
// URL-safe base64 is encoding, not encryption. No server is involved.
export function createShareUrl(state: AppState, metric: Metric, baseUrl: string): string {
  if (!parseState(state) || state.plans.length > 100)
    throw new Error('Check your plan data before sharing (up to 100 plans).')
  const payload: SharedData = { version: 1, state, metric }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  if (encoded.length > maxPayloadLength)
    throw new Error('This comparison is too large for a share link. Try shortening plan notes.')
  const url = new URL(baseUrl)
  // The fragment travels in the link but is not sent in HTTP requests.
  url.hash = `share=${encoded}`
  return url.href
}

export function readShareHash(hash: string): ShareResult {
  if (!hash.startsWith('#share=')) return { kind: 'none' }
  const encoded = hash.slice('#share='.length)
  if (!encoded || encoded.length > maxPayloadLength || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return { kind: 'invalid' }
  }
  try {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    const state = parseState(payload.state)
    if (
      payload.version !== 1 ||
      !state ||
      state.plans.length > 100 ||
      !['netPremium', 'deductible', 'maximum'].includes(payload.metric)
    ) {
      return { kind: 'invalid' }
    }
    return { kind: 'valid', state, metric: payload.metric }
  } catch {
    return { kind: 'invalid' }
  }
}
