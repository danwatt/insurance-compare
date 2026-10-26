import { planCosts } from './calculator.ts'
import type { Comparison } from './calculator.ts'

// Assumed only when a saved plan has no entered rate. The chart discloses it.
export const assumedCoinsurance = 20

// Equal allowed medical spending per family member, all subject to deductible.
// Under this assumption, per-person and family limits reduce to the exposure
// calculated by planCosts. Split enrollments receive their members' share.
export function annualCostAtSpending(comparison: Comparison, spending: number): number {
  const familySize = comparison.enrollments.reduce((sum, e) => sum + e.members, 0)
  let care = 0
  for (const { plan, members } of comparison.enrollments) {
    const { deductibleExposure: deductible, maximumExposure: maximum } = planCosts(plan, members)
    const allowed = (Math.max(0, spending) * members) / familySize
    const rate = (plan.coinsurance ?? assumedCoinsurance) / 100
    care += Math.min(
      maximum,
      Math.min(allowed, deductible) + Math.max(0, allowed - deductible) * rate,
    )
  }
  return comparison.netPremium + care
}

// These are the only places where a cost curve changes slope. Keeping them
// exact avoids missing a crossover between sampled chart points.
export function spendingKnots(comparison: Comparison, maxSpending: number): number[] {
  const familySize = comparison.enrollments.reduce((sum, e) => sum + e.members, 0)
  const points = [0, maxSpending]
  for (const { plan, members } of comparison.enrollments) {
    const { deductibleExposure: deductible, maximumExposure: maximum } = planCosts(plan, members)
    const scale = familySize / members
    const rate = (plan.coinsurance ?? assumedCoinsurance) / 100
    points.push(deductible * scale)
    if (rate > 0) points.push((deductible + (maximum - deductible) / rate) * scale)
  }
  return [...new Set(points.filter((x) => x >= 0 && x <= maxSpending))].sort((a, b) => a - b)
}

export interface CostInterval {
  from: number
  to: number
  winners: string[]
}

export interface Crossover {
  spending: number
  cost: number
  first: string
  second: string
}

export function findBreakEvens(comparisons: Comparison[], maxSpending: number) {
  const crossings: Crossover[] = []
  const boundaries = new Set([0, maxSpending])
  for (const comparison of comparisons) {
    for (const knot of spendingKnots(comparison, maxSpending)) boundaries.add(knot)
  }
  for (let i = 0; i < comparisons.length; i++) {
    for (let j = i + 1; j < comparisons.length; j++) {
      const first = comparisons[i]!,
        second = comparisons[j]!
      const knots = [
        ...new Set([...spendingKnots(first, maxSpending), ...spendingKnots(second, maxSpending)]),
      ].sort((a, b) => a - b)
      const difference = (x: number) =>
        annualCostAtSpending(first, x) - annualCostAtSpending(second, x)
      for (let k = 0; k < knots.length - 1; k++) {
        const left = knots[k]!,
          right = knots[k + 1]!
        const leftDifference = difference(left),
          rightDifference = difference(right)
        // Parallel/coincident segments have no unique crossing.
        if (Math.abs(rightDifference - leftDifference) < 1e-9) continue
        const x = left - (leftDifference * (right - left)) / (rightDifference - leftDifference)
        if (x < left - 1e-7 || x > right + 1e-7 || x <= 0 || x >= maxSpending) continue
        boundaries.add(Math.max(left, Math.min(right, x)))
        if (
          !crossings.some(
            (c) =>
              c.first === first.id && c.second === second.id && Math.abs(c.spending - x) < 1e-6,
          )
        ) {
          crossings.push({
            spending: x,
            cost: annualCostAtSpending(first, x),
            first: first.id,
            second: second.id,
          })
        }
      }
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  const intervals: CostInterval[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]!,
      to = sorted[i + 1]!
    if (to - from < 1e-6 || !comparisons.length) continue
    const midpoint = (from + to) / 2
    const costs = comparisons.map((c) => annualCostAtSpending(c, midpoint))
    const minimum = Math.min(...costs)
    const winners = comparisons
      .filter((_, index) => Math.abs(costs[index]! - minimum) < 1e-7)
      .map((c) => c.id)
      .sort()
    const previous = intervals.at(-1)
    if (previous && previous.winners.join('|') === winners.join('|')) previous.to = to
    else intervals.push({ from, to, winners })
  }
  return { intervals, crossings: crossings.sort((a, b) => a.spending - b.spending) }
}
