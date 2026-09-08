import assert from 'node:assert/strict'
import test from 'node:test'
import {
  comparePlans,
  membersCovered,
  periodicCosts,
  planCosts,
  previousComparison,
  validatePlan,
} from '../src/calculator.ts'
import type { Plan } from '../src/calculator.ts'

const household = { first: 'Father', second: 'Mother', children: 2 }
const plan: Plan = {
  id: 'family',
  name: 'PPO',
  employer: 'Employer A',
  owner: 'first',
  coverage: 'family',
  premium: 100,
  periods: 26,
  individualDeductible: 1500,
  familyDeductible: 3000,
  aggregateDeductible: false,
  individualMaximum: 5000,
  familyMaximum: 10000,
  contribution: 500,
  notes: '',
}

test('annualizes payroll premiums and caps family exposure', () => {
  assert.deepEqual(planCosts(plan, 4), {
    premium: 2600,
    deductibleExposure: 3000,
    maximumExposure: 10000,
  })
  const result = comparePlans(household, [plan])[0]!
  assert.equal(result.premium, 2600) // Actual premiums are preserved.
  assert.equal(result.netPremium, 2100)
  assert.equal(result.deductible, 5100)
  assert.equal(result.maximum, 12100) // Deductible is not added again.
  assert.equal(result.contribution, 500) // Match is counted once, not per member.
})

test('uses individual limits for employee-only coverage', () => {
  assert.deepEqual(planCosts({ ...plan, coverage: 'individual' }, 1), {
    premium: 2600,
    deductibleExposure: 1500,
    maximumExposure: 5000,
  })
})

test('uses covered-member counts when family caps are higher', () => {
  assert.deepEqual(planCosts({ ...plan, familyDeductible: 6000, familyMaximum: 20000 }, 2), {
    premium: 2600,
    deductibleExposure: 3000,
    maximumExposure: 10000,
  })
})

test('aggregate deductible uses the family threshold, bounded by OOP exposure', () => {
  assert.equal(
    planCosts({ ...plan, aggregateDeductible: true, familyDeductible: 6000 }, 2).deductibleExposure,
    6000,
  )
  assert.equal(
    planCosts(
      { ...plan, aggregateDeductible: true, familyDeductible: 12000, familyMaximum: 15000 },
      2,
    ).deductibleExposure,
    10000,
  )
})

test('builds both together options and all child splits with everyone covered once', () => {
  const plans: Plan[] = (['first', 'second'] as const).flatMap((owner) =>
    (['family', 'individual', 'children'] as const).map((coverage) => ({
      ...plan,
      id: `${owner}-${coverage}`,
      owner,
      coverage,
    })),
  )
  const results = comparePlans(household, plans)
  assert.equal(results.length, 5)
  assert.equal(new Set(results.map((result) => result.id)).size, 5)
  for (const result of results)
    assert.equal(
      result.enrollments.reduce((sum, enrollment) => sum + enrollment.members, 0),
      4,
    )
  const split = results.find((result) => result.id === 'split-first-individual-second-children-0')!
  assert.equal(split.premium, 5200)
  assert.equal(split.contribution, 1000)
  assert.equal(split.netPremium, 4200)
  assert.equal(split.deductible, 8700)
  assert.equal(split.maximum, 19200)
})

test('an employee + one child tier covers a single allocated child', () => {
  const plans: Plan[] = (['first', 'second'] as const).flatMap((owner) =>
    (['individual', 'child', 'children'] as const).map((coverage) => ({
      ...plan,
      id: `${owner}-${coverage}`,
      owner,
      coverage,
    })),
  )
  const results = comparePlans(household, plans)
  // With two children, one per parent, the single-child tier is eligible
  // alongside the general employee + children tier.
  const oneEach = results.filter((r) => r.id.startsWith('split-') && r.id.endsWith('-1'))
  assert.deepEqual(
    new Set(oneEach.map((r) => r.id)),
    new Set([
      'split-first-child-second-child-1',
      'split-first-child-second-children-1',
      'split-first-children-second-child-1',
      'split-first-children-second-children-1',
    ]),
  )
  for (const result of oneEach)
    assert.equal(
      result.enrollments.reduce((sum, e) => sum + e.members, 0),
      4,
    )
  // The single-child tier is priced from the same fields as any two-person tier.
  const bothSingleChild = results.find((r) => r.id === 'split-first-child-second-child-1')!
  assert.equal(bothSingleChild.premium, 5200)
  assert.equal(bothSingleChild.deductible, 10200)
})

test('the employee + one child tier is not used for two or more allocated children', () => {
  const results = comparePlans({ ...household, children: 3 }, [
    { ...plan, id: 'first-child', owner: 'first', coverage: 'child' },
    { ...plan, id: 'second-child', owner: 'second', coverage: 'child' },
  ])
  // Neither parent can take all three children on a single-child tier,
  // and 1 + 1 leaves a child uncovered, so nothing is eligible.
  assert.deepEqual(results, [])
})

test('incompatible tiers do not produce partial-family comparisons', () => {
  assert.deepEqual(comparePlans(household, [{ ...plan, coverage: 'spouse' }]), [])
  assert.deepEqual(comparePlans(household, [{ ...plan, coverage: 'individual' }]), [])
  assert.deepEqual(comparePlans(household, []), [])
})

test('a childless couple can use spouse or two employee-only tiers', () => {
  const results = comparePlans({ ...household, children: 0 }, [
    { ...plan, coverage: 'spouse' },
    { ...plan, id: 'first-only', coverage: 'individual' },
    { ...plan, id: 'second-only', owner: 'second', coverage: 'individual' },
  ])
  assert.equal(results.length, 2)
  assert.ok(
    results.every(
      (result) => result.enrollments.reduce((sum, item) => sum + item.members, 0) === 2,
    ),
  )
})

test('multiple benefit plans produce separate combinations', () => {
  assert.equal(comparePlans(household, [plan, { ...plan, id: 'another', name: 'HDHP' }]).length, 2)
})

test('zero amounts are valid and fractional premiums retain cents', () => {
  assert.equal(planCosts({ ...plan, premium: 12.34, periods: 24 }, 1).premium, 296.16)
  const free = {
    ...plan,
    contribution: 0,
    premium: 0,
    individualDeductible: 0,
    familyDeductible: 0,
    individualMaximum: 0,
    familyMaximum: 0,
  }
  assert.equal(validatePlan(free), null)
  assert.equal(comparePlans(household, [free])[0]!.maximum, 0)
})

test('HSA Match can change the cheapest plan in every scenario', () => {
  const results = comparePlans(household, [
    { ...plan, id: 'lower-premium', premium: 100, contribution: 0 },
    { ...plan, id: 'with-match', premium: 110, contribution: 500 },
  ])
  assert.equal(results[0]!.premium, 2600)
  assert.equal(results[1]!.premium, 2860)
  for (const metric of ['netPremium', 'deductible', 'maximum'] as const) {
    assert.equal([...results].sort((a, b) => a[metric] - b[metric])[0]!.id, 'together-with-match')
    assert.equal(results[0]![metric] - results[1]![metric], 240)
  }
})

test('zero match leaves totals unchanged and large matches retain their full value', () => {
  const withoutMatch = comparePlans(household, [{ ...plan, contribution: 0 }])[0]!
  assert.equal(withoutMatch.netPremium, 2600)
  assert.equal(withoutMatch.deductible, 5600)
  assert.equal(withoutMatch.maximum, 12600)
  const withMatch = comparePlans(household, [{ ...plan, premium: 0, contribution: 500 }])[0]!
  assert.equal(withMatch.netPremium, -500)
  assert.equal(withMatch.deductible, 2500)
  assert.equal(withMatch.maximum, 9500)
})

test('monthly and paycheck equivalents include HSA Match and each scenario’s care costs', () => {
  const result = comparePlans(household, [plan])[0]!
  assert.deepEqual(periodicCosts(result, 'netPremium'), {
    monthly: 175,
    paychecks: [{ owner: null, periods: 26, amount: 80.77 }],
  })
  assert.deepEqual(periodicCosts(result, 'deductible'), {
    monthly: 425,
    paychecks: [{ owner: null, periods: 26, amount: 196.15 }],
  })
  assert.deepEqual(periodicCosts(result, 'maximum'), {
    monthly: 1008.33,
    paychecks: [{ owner: null, periods: 26, amount: 465.38 }],
  })
})

test('split coverage combines matching payroll periods and separates different schedules', () => {
  const first: Plan = { ...plan, id: 'first', coverage: 'individual' }
  const second: Plan = {
    ...plan,
    id: 'second',
    owner: 'second',
    coverage: 'children',
    premium: 200,
    contribution: 1000,
  }
  const matching = comparePlans(household, [first, second])[0]!
  assert.deepEqual(periodicCosts(matching, 'netPremium'), {
    monthly: 525,
    paychecks: [{ owner: null, periods: 26, amount: 242.31 }],
  })
  const mixed = comparePlans(household, [first, { ...second, periods: 24 }])[0]!
  assert.deepEqual(periodicCosts(mixed, 'netPremium'), {
    monthly: 491.67,
    paychecks: [
      { owner: 'first', periods: 26, amount: 80.77 },
      { owner: 'second', periods: 24, amount: 158.33 },
    ],
  })
  assert.deepEqual(periodicCosts(mixed, 'maximum').paychecks, [
    { owner: 'first', periods: 26, amount: 273.08 },
    { owner: 'second', periods: 24, amount: 575 },
  ])
})

test('periodic equivalents preserve negative net costs and custom payment schedules', () => {
  const result = comparePlans(household, [{ ...plan, premium: 0, periods: 27 }])[0]!
  assert.deepEqual(periodicCosts(result, 'netPremium'), {
    monthly: -41.67,
    paychecks: [{ owner: null, periods: 27, amount: -18.52 }],
  })
})

test('rejects invalid amounts, payment periods, and inverted limits', () => {
  assert.equal(validatePlan(plan), null)
  for (const invalid of [
    { premium: -1 },
    { premium: NaN },
    { premium: Infinity },
    { periods: 0 },
    { periods: 26.5 },
    { periods: 367 },
    { name: ' ' },
    { individualDeductible: 6000 },
    { familyDeductible: 20000 },
    { familyMaximum: 4000 },
    { familyDeductible: 1000 },
  ])
    assert.ok(validatePlan({ ...plan, ...invalid }))
})

test("last year's plans are excluded from the ranked combinations", () => {
  const previous = { ...plan, id: 'last-year', premium: 80, previous: true }
  const results = comparePlans(household, [plan, previous])
  assert.equal(results.length, 1)
  assert.equal(results[0]!.enrollments[0]!.plan.id, 'family')
})

test("last year's coverage is priced with this year's household", () => {
  const previous = { ...plan, id: 'last-year', premium: 80, previous: true }
  const prior = previousComparison(household, [plan, previous])!
  assert.equal(prior.enrollments.length, 1)
  assert.equal(prior.enrollments[0]!.members, 4) // Full family: two parents + two children.
  assert.equal(prior.premium, 2080)
  assert.equal(prior.netPremium, 1580)
  assert.equal(prior.deductible, 4580)
  assert.equal(prior.maximum, 11580)
  assert.equal(comparePlans(household, [plan])[0]!.netPremium - prior.netPremium, 520)
})

test("last year's coverage combines one entry per parent and ignores extras", () => {
  const first = { ...plan, id: 'p1', coverage: 'individual' as const, previous: true }
  const second = {
    ...plan,
    id: 'p2',
    owner: 'second' as const,
    coverage: 'children' as const,
    previous: true,
  }
  const prior = previousComparison(household, [first, second])!
  assert.deepEqual(
    prior.enrollments.map((e) => [e.plan.id, e.members, e.description]),
    [
      ['p1', 1, 'Father only'],
      ['p2', 3, 'Mother + 2 children'],
    ],
  )
  assert.equal(prior.premium, 5200)
  assert.equal(prior.contribution, 1000) // One match per enrollment.
  assert.equal(previousComparison(household, [plan]), null)
})

test('covered member counts follow the coverage tier', () => {
  assert.equal(membersCovered('individual', household), 1)
  assert.equal(membersCovered('spouse', household), 2)
  assert.equal(membersCovered('child', household), 2)
  assert.equal(membersCovered('children', household), 3)
  assert.equal(membersCovered('family', household), 4)
  assert.equal(membersCovered('family', { ...household, children: 0 }), 2)
})
