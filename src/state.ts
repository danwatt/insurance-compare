import { validatePlan } from './calculator.ts'
import type { Household, Plan } from './calculator.ts'

export interface AppState {
  household: Household
  plans: Plan[]
  sample: boolean
}
const storageKey = 'family-plan-comparison-v1'

export function sampleState(): AppState {
  const base = {
    periods: 26,
    individualDeductible: 1500,
    familyDeductible: 3000,
    aggregateDeductible: false,
    individualMaximum: 5000,
    familyMaximum: 10000,
    contribution: 0,
    notes: '',
  }
  return {
    household: { first: 'Father', second: 'Mother', children: 2 },
    sample: true,
    plans: [
      {
        ...base,
        id: 'a-family',
        owner: 'first',
        employer: 'Acme Co.',
        name: 'Choice PPO',
        coverage: 'family',
        premium: 320,
      },
      {
        ...base,
        id: 'a-single',
        owner: 'first',
        employer: 'Acme Co.',
        name: 'Choice PPO',
        coverage: 'individual',
        premium: 65,
      },
      {
        ...base,
        id: 'a-children',
        owner: 'first',
        employer: 'Acme Co.',
        name: 'Choice PPO',
        coverage: 'children',
        premium: 230,
      },
      {
        ...base,
        id: 'b-family',
        owner: 'second',
        employer: 'Summit Studio',
        name: 'Health Plus',
        coverage: 'family',
        premium: 280,
        individualDeductible: 2000,
        familyDeductible: 4000,
        individualMaximum: 4500,
        familyMaximum: 9000,
      },
      {
        ...base,
        id: 'b-single',
        owner: 'second',
        employer: 'Summit Studio',
        name: 'Health Plus',
        coverage: 'individual',
        premium: 55,
        individualDeductible: 2000,
        familyDeductible: 4000,
        individualMaximum: 4500,
        familyMaximum: 9000,
      },
      {
        ...base,
        id: 'b-children',
        owner: 'second',
        employer: 'Summit Studio',
        name: 'Health Plus',
        coverage: 'children',
        premium: 175,
        individualDeductible: 2000,
        familyDeductible: 4000,
        individualMaximum: 4500,
        familyMaximum: 9000,
      },
    ],
  }
}

// Validate both saved data and shared links before they enter the calculator.
export function parseState(value: unknown): AppState | null {
  try {
    const data = value as AppState
    if (
      !data ||
      !data.household ||
      typeof data.household.first !== 'string' ||
      !data.household.first.trim() ||
      data.household.first.length > 40 ||
      typeof data.household.second !== 'string' ||
      !data.household.second.trim() ||
      data.household.second.length > 40 ||
      !Number.isInteger(data.household.children) ||
      data.household.children < 0 ||
      data.household.children > 20 ||
      !Array.isArray(data.plans) ||
      typeof data.sample !== 'boolean' ||
      data.plans.some(
        (p) =>
          !p ||
          typeof p.id !== 'string' ||
          !p.id ||
          p.id.length > 100 ||
          typeof p.name !== 'string' ||
          p.name.length > 80 ||
          typeof p.employer !== 'string' ||
          p.employer.length > 80 ||
          typeof p.notes !== 'string' ||
          p.notes.length > 1000 ||
          typeof p.aggregateDeductible !== 'boolean' ||
          validatePlan(p),
      ) ||
      new Set(data.plans.map((p) => p.id)).size !== data.plans.length
    )
      return null
    return data
  } catch {
    return null
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (parseState(JSON.parse(raw)) ?? sampleState()) : sampleState()
  } catch {
    return sampleState()
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
