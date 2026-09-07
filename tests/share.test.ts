import assert from 'node:assert/strict'
import test from 'node:test'
import { createShareUrl, readShareHash } from '../src/share.ts'
import { loadState, saveState, sampleState, parseState } from '../src/state.ts'

test('share URL restores every field, Unicode, and selected scenario', () => {
  const state = sampleState()
  state.sample = false
  state.household.first = 'José 🧑'
  state.household.second = '李'
  state.household.children = 3
  Object.assign(state.plans[0]!, {
    employer: 'A & B',
    premium: 123.45,
    periods: 27,
    contribution: 500,
    aggregateDeductible: true,
    notes: 'Network: 東京\nRx & care + # / = ? 🩺',
  })
  const url = new URL(
    createShareUrl(state, 'maximum', 'https://example.com/calculator/#comparison'),
  )
  assert.equal(url.origin + url.pathname, 'https://example.com/calculator/')
  assert.equal(url.search, '')
  assert.match(url.hash, /^#share=[A-Za-z0-9_-]+$/)
  assert.deepEqual(readShareHash(url.hash), { kind: 'valid', state, metric: 'maximum' })
})

test('shared snapshots remain unchanged after the sender edits their data', () => {
  const state = sampleState()
  const original = structuredClone(state)
  const url = createShareUrl(state, 'deductible', 'https://example.com/')
  state.plans[0]!.contribution = 1000
  assert.deepEqual(readShareHash(new URL(url).hash), {
    kind: 'valid',
    state: original,
    metric: 'deductible',
  })
})

test('empty comparisons can be shared', () => {
  const state = { ...sampleState(), plans: [], sample: false }
  assert.deepEqual(
    readShareHash(new URL(createShareUrl(state, 'netPremium', 'https://example.com/')).hash),
    {
      kind: 'valid',
      state,
      metric: 'netPremium',
    },
  )
})

test('rejects malformed, oversized, unsupported, and invalid links', () => {
  for (const hash of ['#share=', '#share=!', '#share=a', '#share=' + 'a'.repeat(250001)]) {
    assert.equal(readShareHash(hash).kind, 'invalid')
  }
  const state = sampleState()
  for (const payload of [
    { version: 2, state, metric: 'maximum' },
    { version: 1, state, metric: 'bogus' },
    { version: 1, state: null, metric: 'maximum' },
    {
      version: 1,
      state: { ...state, household: { ...state.household, children: -1 } },
      metric: 'maximum',
    },
    {
      version: 1,
      state: { ...state, plans: [{ ...state.plans[0], premium: '100' }] },
      metric: 'maximum',
    },
  ]) {
    const encoded = btoa(JSON.stringify(payload))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
    assert.equal(readShareHash('#share=' + encoded).kind, 'invalid')
  }
  assert.equal(readShareHash('#comparison').kind, 'none')
  assert.equal(readShareHash('').kind, 'none')
  assert.equal(parseState({}), null)
})

test('local storage saves and restores all calculator data and tolerates failures', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  try {
    const state = sampleState()
    state.plans[0]!.contribution = 500
    assert.equal(saveState(state), true)
    assert.deepEqual(loadState(), state)
    const bad = '#share=invalid'
    assert.equal(readShareHash(bad).kind, 'invalid')
    assert.deepEqual(loadState(), state)
    values.set('family-plan-comparison-v1', '{broken')
    assert.deepEqual(loadState(), sampleState())
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Unavailable')
      },
    })
    assert.equal(saveState(state), false)
    assert.deepEqual(loadState(), sampleState())
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
