import assert from 'node:assert/strict'
import test from 'node:test'
import { annualCostAtSpending, findBreakEvens, spendingKnots } from '../src/breakEven.ts'
import { buildComparison, comparePlans, validatePlan } from '../src/calculator.ts'
import { sampleState, parseState } from '../src/state.ts'
import { createShareUrl, readShareHash } from '../src/share.ts'
import type { Plan } from '../src/calculator.ts'

const plan: Plan = {
  id: 'a',
  owner: 'first',
  coverage: 'family',
  name: 'A',
  employer: 'Employer',
  premium: 100,
  periods: 12,
  individualDeductible: 2000,
  familyDeductible: 4000,
  individualMaximum: 6000,
  familyMaximum: 12000,
  aggregateDeductible: false,
  contribution: 0,
  coinsurance: 20,
  notes: '',
}
const comparison = (p: Plan, members = 2) =>
  buildComparison(p.id, p.name, [{ plan: p, members, description: p.name }])
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

test('models premiums, deductible, coinsurance, and the out-of-pocket cap', () => {
  const result = comparison(plan)
  assert.equal(annualCostAtSpending(result, 0), 1200)
  assert.equal(annualCostAtSpending(result, 3000), 4200)
  assert.equal(annualCostAtSpending(result, 10000), 6400)
  assert.equal(annualCostAtSpending(result, 100000), result.maximum)
  assert.deepEqual(spendingKnots(result, 100000), [0, 4000, 44000, 100000])
})

test('finds the exact crossover between linear segments', () => {
  const a = comparison(plan)
  const b = comparison({
    ...plan,
    id: 'b',
    premium: 200,
    individualDeductible: 500,
    familyDeductible: 1000,
    familyMaximum: 8000,
  })
  const { intervals, crossings } = findBreakEvens([a, b], 100000)
  assert.deepEqual(intervals, [
    { from: 0, to: 2500, winners: ['a'] },
    { from: 2500, to: 100000, winners: ['b'] },
  ])
  close(crossings[0]!.spending, 2500)
  close(crossings[0]!.cost, 3700)
})

test('detects multiple winner changes as plans reach different limits', () => {
  const a = comparison({ ...plan, premium: 0, individualMaximum: 2000, familyMaximum: 4000 })
  const b = comparison({
    ...plan,
    id: 'b',
    premium: 1000 / 12,
    individualDeductible: 0,
    familyDeductible: 0,
  })
  const { intervals } = findBreakEvens([a, b], 100000)
  assert.equal(intervals.length, 3)
  close(intervals[0]!.to, 1250)
  close(intervals[1]!.to, 15000)
  assert.deepEqual(
    intervals.map((i) => i.winners),
    [['a'], ['b'], ['a']],
  )
})

test('pairwise crossings do not necessarily change the cheapest option', () => {
  const a = comparison(plan)
  const b = comparison({
    ...plan,
    id: 'b',
    premium: 200,
    familyDeductible: 1000,
    individualDeductible: 500,
  })
  const c = comparison({
    ...plan,
    id: 'c',
    premium: 0,
    familyDeductible: 0,
    individualDeductible: 0,
    coinsurance: 0,
  })
  const analysis = findBreakEvens([a, b, c], 100000)
  assert.ok(analysis.crossings.length > 0)
  assert.deepEqual(analysis.intervals, [{ from: 0, to: 100000, winners: ['c'] }])
})

test('ties, no crossings, limited ranges, and empty selections are represented honestly', () => {
  const a = comparison(plan),
    b = comparison({ ...plan, id: 'b' })
  assert.deepEqual(findBreakEvens([a, b], 50000), {
    crossings: [],
    intervals: [{ from: 0, to: 50000, winners: ['a', 'b'] }],
  })
  assert.deepEqual(findBreakEvens([], 50000), { crossings: [], intervals: [] })
  assert.equal(findBreakEvens([a], 1000).intervals.length, 1)
})

test('split plans receive spending in proportion to their covered members', () => {
  const a = { ...plan, coverage: 'individual' as const, contribution: 500 }
  const b = {
    ...plan,
    id: 'b',
    coverage: 'children' as const,
    owner: 'second' as const,
    contribution: 1000,
  }
  const result = buildComparison('split', 'Split', [
    { plan: a, members: 1, description: 'Father' },
    { plan: b, members: 3, description: 'Mother + children' },
  ])
  // 8k total: 2k goes to single plan, 6k to the other (4k deductible + 400 coinsurance).
  assert.equal(annualCostAtSpending(result, 8000), 900 + 2000 + 4400)
  assert.equal(annualCostAtSpending(result, 1000000), result.maximum)
})

test('aggregate deductibles, zero and full coinsurance, and negative net premiums', () => {
  const aggregate = comparison({ ...plan, aggregateDeductible: true, familyDeductible: 6000 })
  assert.equal(annualCostAtSpending(aggregate, 6000), 7200)
  assert.equal(annualCostAtSpending(aggregate, 10000), 8000)
  const zero = comparison({ ...plan, coinsurance: 0 })
  assert.equal(annualCostAtSpending(zero, 100000), 5200)
  assert.ok(spendingKnots(zero, 100000).every(Number.isFinite))
  const full = comparison({ ...plan, coinsurance: 100 })
  assert.equal(annualCostAtSpending(full, 9000), 10200)
  const funded = comparison({ ...plan, contribution: 2000 })
  assert.equal(annualCostAtSpending(funded, 0), -800)
})

test('coinsurance validation and old saved/share data remain compatible', () => {
  assert.equal(validatePlan({ ...plan, coinsurance: 0 }), null)
  for (const coinsurance of [-1, 101, NaN, Infinity])
    assert.ok(validatePlan({ ...plan, coinsurance }))
  const state = sampleState()
  assert.ok(parseState(state))
  const legacy = comparison({ ...plan, coinsurance: undefined })
  assert.equal(annualCostAtSpending(legacy, 10000), annualCostAtSpending(comparison(plan), 10000))
  state.plans[0]!.coinsurance = 35
  const link = new URL(createShareUrl(state, 'netPremium', 'https://example.com'))
  const decoded = readShareHash(link.hash)
  assert.equal(decoded.kind, 'valid')
  if (decoded.kind === 'valid') assert.equal(decoded.state.plans[0]!.coinsurance, 35)
  // Reference-only last-year plans never enter this chart's candidate set.
  assert.ok(
    comparePlans(state.household, state.plans).every((c) =>
      c.enrollments.every((e) => !e.plan.previous),
    ),
  )
})
