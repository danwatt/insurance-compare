// Pure calculation functions: no DOM or browser state here.
export type Parent = 'first' | 'second'
export type Coverage = 'individual' | 'spouse' | 'children' | 'family'
export type Metric = 'netPremium' | 'deductible' | 'maximum'

export interface Household {
  first: string
  second: string
  children: number
}

// Each entry represents one enrollment tier from an employer's benefits guide.
// Add separate entries when premiums or limits differ by coverage tier.
export interface Plan {
  id: string
  name: string
  employer: string
  owner: Parent
  coverage: Coverage
  premium: number
  periods: number
  individualDeductible: number
  familyDeductible: number
  aggregateDeductible: boolean
  individualMaximum: number
  familyMaximum: number
  contribution: number
  notes: string
}

export interface Enrollment {
  plan: Plan
  members: number
  description: string
}

export interface Comparison {
  id: string
  title: string
  enrollments: Enrollment[]
  premium: number
  netPremium: number
  deductible: number
  maximum: number
  deductibleExposure: number
  maximumExposure: number
  contribution: number
}

export const coverageLabels: Record<Coverage, string> = {
  individual: 'Employee only',
  spouse: 'Employee + spouse',
  children: 'Employee + children',
  family: 'Full family',
}

export function planCosts(plan: Plan, members: number) {
  const premium = Math.round(plan.premium * plan.periods * 100) / 100
  const maximumExposure =
    members === 1
      ? plan.individualMaximum
      : Math.min(plan.individualMaximum * members, plan.familyMaximum)
  const deductibleLimit =
    members === 1
      ? plan.individualDeductible
      : plan.aggregateDeductible
        ? plan.familyDeductible
        : Math.min(plan.individualDeductible * members, plan.familyDeductible)
  // Covered deductible spending cannot exceed the applicable OOP limit.
  const deductibleExposure = Math.min(deductibleLimit, maximumExposure)
  return { premium, deductibleExposure, maximumExposure }
}

// Spread the scenario's net annual cost evenly for budgeting purposes.
// Different payroll schedules stay separate instead of inventing a shared paycheck.
export function periodicCosts(comparison: Comparison, metric: Metric) {
  const cents = (amount: number) => Math.round(amount * 100) / 100
  const periods = comparison.enrollments[0]!.plan.periods
  const sameSchedule = comparison.enrollments.every((e) => e.plan.periods === periods)
  const paychecks = sameSchedule
    ? [{ owner: null, periods, amount: cents(comparison[metric] / periods) }]
    : comparison.enrollments.map(({ plan, members }) => {
        const costs = planCosts(plan, members)
        const care =
          metric === 'deductible'
            ? costs.deductibleExposure
            : metric === 'maximum'
              ? costs.maximumExposure
              : 0
        return {
          owner: plan.owner,
          periods: plan.periods,
          amount: cents((costs.premium + care - plan.contribution) / plan.periods),
        }
      })
  return { monthly: cents(comparison[metric] / 12), paychecks }
}

export function comparePlans(household: Household, plans: Plan[]): Comparison[] {
  const comparisons: Comparison[] = []
  const add = (id: string, title: string, enrollments: Enrollment[]) => {
    let premium = 0,
      deductibleExposure = 0,
      maximumExposure = 0,
      contribution = 0
    for (const enrollment of enrollments) {
      const cost = planCosts(enrollment.plan, enrollment.members)
      premium += cost.premium
      deductibleExposure += cost.deductibleExposure
      maximumExposure += cost.maximumExposure
      contribution += enrollment.plan.contribution
    }
    comparisons.push({
      id,
      title,
      enrollments,
      premium,
      deductibleExposure,
      maximumExposure,
      // Count the expected annual employer HSA deposit once per enrollment.
      // This is net economic cost; actual payroll premiums stay unchanged.
      netPremium: Math.round((premium - contribution) * 100) / 100,
      deductible: Math.round((premium + deductibleExposure - contribution) * 100) / 100,
      maximum: Math.round((premium + maximumExposure - contribution) * 100) / 100,
      contribution,
    })
  }

  for (const plan of plans) {
    if (plan.coverage === 'family' || (household.children === 0 && plan.coverage === 'spouse')) {
      add(`together-${plan.id}`, `Everyone on ${household[plan.owner]}'s plan`, [
        {
          plan,
          members: 2 + household.children,
          description: `${household.first} + ${household.second}${household.children ? ` + ${household.children} ${household.children === 1 ? 'child' : 'children'}` : ''}`,
        },
      ])
    }
  }

  // Try every child allocation, with each parent on their own employer's plan.
  // Children are interchangeable here because the scenarios assume equal usage.
  for (let firstChildren = 0; firstChildren <= household.children; firstChildren++) {
    const secondChildren = household.children - firstChildren
    const firstPlans = plans.filter(
      (p) => p.owner === 'first' && p.coverage === (firstChildren ? 'children' : 'individual'),
    )
    const secondPlans = plans.filter(
      (p) => p.owner === 'second' && p.coverage === (secondChildren ? 'children' : 'individual'),
    )
    for (const first of firstPlans) {
      for (const second of secondPlans) {
        const describe = (owner: Parent, children: number) =>
          `${household[owner]}${children ? ` + ${children} ${children === 1 ? 'child' : 'children'}` : ' only'}`
        const title =
          household.children === 0
            ? 'Each on their own plan'
            : firstChildren === 0
              ? `Children with ${household.second}`
              : secondChildren === 0
                ? `Children with ${household.first}`
                : 'Children split between plans'
        add(`split-${first.id}-${second.id}-${firstChildren}`, title, [
          {
            plan: first,
            members: firstChildren + 1,
            description: describe('first', firstChildren),
          },
          {
            plan: second,
            members: secondChildren + 1,
            description: describe('second', secondChildren),
          },
        ])
      }
    }
  }
  return comparisons
}

export function validatePlan(plan: Plan): string | null {
  if (!plan.name.trim() || !plan.employer.trim()) return 'Enter a plan name and employer.'
  if (!['first', 'second'].includes(plan.owner) || !Object.hasOwn(coverageLabels, plan.coverage))
    return 'Choose a valid employee and coverage tier.'
  const numbers = [
    plan.premium,
    plan.individualDeductible,
    plan.familyDeductible,
    plan.individualMaximum,
    plan.familyMaximum,
    plan.contribution,
  ]
  if (numbers.some((value) => !Number.isFinite(value) || value < 0 || value > 10_000_000))
    return 'Amounts must be between $0 and $10,000,000.'
  if (!Number.isInteger(plan.periods) || plan.periods < 1 || plan.periods > 366)
    return 'Enter a whole number of payments between 1 and 366.'
  if (plan.individualDeductible > plan.individualMaximum)
    return 'The individual deductible cannot exceed the individual out-of-pocket maximum.'
  if (plan.coverage !== 'individual') {
    if (plan.familyDeductible > plan.familyMaximum)
      return 'The family deductible cannot exceed the family out-of-pocket maximum.'
    if (plan.familyMaximum < plan.individualMaximum)
      return 'The family out-of-pocket maximum must be at least the individual maximum.'
    if (!plan.aggregateDeductible && plan.familyDeductible < plan.individualDeductible)
      return 'The family deductible must be at least the individual deductible.'
  }
  return null
}
