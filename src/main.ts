import './style.css'
import {
  comparePlans,
  coverageLabels,
  planCosts,
  periodicCosts,
  previousComparison,
  validatePlan,
} from './calculator'
import type { Comparison, Coverage, Metric, Parent, Plan } from './calculator'
import { loadState, sampleState, saveState } from './state'
import { createShareUrl, readShareHash } from './share'

const app = document.querySelector<HTMLDivElement>('#app')!
const shared = readShareHash(location.hash)
let state = shared.kind === 'valid' ? shared.state : loadState()
let metric: Metric = shared.kind === 'valid' ? shared.metric : 'netPremium'
let shareNotice =
  shared.kind === 'valid'
    ? 'Shared comparison loaded. Edits are saved in this browser.'
    : shared.kind === 'invalid'
      ? 'This share link is invalid or incomplete. Your saved comparison has been kept.'
      : ''
if (shared.kind !== 'none') history.replaceState(null, '', location.pathname + location.search)
let saved = true
const money = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
// Escape user text before including it in HTML.
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  )
const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
    people:
      '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    building:
      '<path d="M5 21V3h14v18M3 21h18M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    printer:
      '<path d="M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7z"/>',
    leaf: '<path d="M20 4C8 2 1 10 6 17s16 0 14-13ZM6 18l9-9M4 21l2-3"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"/><path d="M12 7v5l3 2"/>',
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.shield}</svg>`
}

function persist() {
  saved = saveState(state)
}

function render() {
  app.innerHTML = `
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="#"><span class="brand-mark">${icon('shield', 23)}</span>CoverCompare<span class="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><a class="active" href="#comparison">Plan comparison</a><a href="#how-it-works">How it works</a></nav>
      <span class="private-label">${icon('shield', 15)} Private by design</span>
    </div></header>
    <main>
      ${shareNotice ? `<div class="sample-banner share-notice" role="status"><span>${escape(shareNotice)}</span><button id="dismiss-notice" aria-label="Dismiss sharing notice">${icon('close', 16)}</button></div>` : ''}
      <section class="intro">
        <div><div class="eyebrow"><span></span> A LITTLE CLARITY FOR A BIG DECISION</div>
          <h1>Better coverage starts<br>with the <em>whole picture.</em></h1>
          <p>One family. A few possibilities. Compare your health plans<br class="desktop-break"> and find a combination that makes sense for you.</p>
        </div>
        <div class="intro-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-leaf">${icon('leaf', 34)}</span><div class="art-card"><div class="art-icon">${icon('people', 28)}</div><span>YOUR FAMILY, COVERED</span><div class="art-bars"><i></i><i></i><i></i></div><div class="art-line"></div><div class="art-line short"></div></div><span class="art-check">${icon('check', 20)}</span></div>
      </section>
      <section class="family-panel" aria-labelledby="family-heading">
        <div class="family-heading"><span class="section-icon">${icon('people', 23)}</span><div><h2 id="family-heading">Your household</h2><p>Who's coming along?</p></div></div>
        <label>First parent<input id="first-parent" maxlength="40" value="${escape(state.household.first)}" required></label>
        <label>Second parent<input id="second-parent" maxlength="40" value="${escape(state.household.second)}" required></label>
        <label>Children<div class="stepper"><button data-children="-1" aria-label="Remove one child" ${state.household.children === 0 ? 'disabled' : ''}>−</button><input id="children" type="number" min="0" max="20" step="1" value="${state.household.children}" aria-label="Number of children"><button data-children="1" aria-label="Add one child" ${state.household.children === 20 ? 'disabled' : ''}>+</button></div></label>
        <span class="member-total"><strong>${state.household.children + 2}</strong> family members</span>
      </section>
      <section id="plans" aria-labelledby="plans-heading">
        <div class="section-heading"><div><div class="section-kicker">01 / THE OPTIONS</div><h2 id="plans-heading">Your available plans <span class="count">${state.plans.filter((plan) => !plan.previous).length}</span></h2><p>Add each coverage tier from your employers' benefits guides.</p></div><button class="button primary" id="add-plan">${icon('plus', 17)} Add a plan</button></div>
        ${state.sample ? `<div class="sample-banner"><span>${icon('info', 17)} <strong>Example plans loaded.</strong> Replace the sample rates with your own, or start fresh.</span><button id="start-fresh">Start with my plans ${icon('arrow', 16)}</button></div>` : ''}
        <div class="employer-grid">${(['first', 'second'] as Parent[]).map((owner) => employerCard(owner)).join('')}</div>
        <div class="under-plans"><span>${icon(saved ? 'check' : 'info', 14)} ${saved ? 'Changes saved in this browser. Your data stays on this device.' : 'Browser storage is unavailable. Export your results before leaving.'}</span><span>All costs in USD · One full plan year</span></div>
      </section>
      <section id="comparison" aria-labelledby="comparison-heading">
        <div class="section-heading"><div><div class="section-kicker">02 / THE BIG PICTURE</div><h2 id="comparison-heading">Find your best fit</h2><p>Every eligible combination. Three ways to look at the cost.</p></div><div class="comparison-actions"><button class="button secondary" id="share">Share comparison</button><button class="button secondary" id="print">${icon('printer', 17)} Print / Save PDF</button><button class="button secondary" id="export" ${comparePlans(state.household, state.plans).length ? '' : 'disabled'}>${icon('download', 17)} Export results</button></div></div>
        <div id="results"></div>
      </section>
      <section class="explanation" id="how-it-works">
        <div class="section-kicker">THE DETAILS MATTER</div><h2>A clearer comparison, with a few assumptions.</h2>
        <div class="explanation-grid"><div><span class="explanation-number">01</span><h3>Premiums are the starting line.</h3><p>Your share of each payment × payments per year. Use 12 for monthly, 24 for twice monthly, or 26 for every two weeks. Include applicable surcharges in the premium. The baseline comparison subtracts your expected annual HSA Match.</p></div><div><span class="explanation-number">02</span><h3>Family limits work together.</h3><p>For embedded deductibles, we use the lower of the individual limit × covered members or the family limit. Aggregate plans use the family deductible, capped by applicable out-of-pocket limits.</p></div><div><span class="explanation-number">03</span><h3>Worst case has a boundary.</h3><p>Premiums + out-of-pocket exposure − HSA Match for covered, in-network care. The deductible is already part of this limit. Out-of-network care, excluded services, and tax effects are not included.</p></div></div>
        <details class="assumptions"><summary>${icon('info', 17)} What else should I check in my benefits guide?</summary><div><p>Compare provider networks, prescription coverage, copays, coinsurance, HSA Match, and working-spouse surcharges or exclusions. The expected annual HSA Match is deducted once from each scenario total, including when it remains in your HSA for future care. Your own HSA contributions are not deducted.</p><p>These are spending scenarios, not a prediction of medical bills. The deductible scenario excludes copays and coinsurance beyond the deductible. Enter the per-person limits that apply to the chosen tier; these can differ from employee-only limits. All out-of-pocket limits here are embedded individual limits.</p><p>Each tier must be eligible for the people shown. “Employee + one child” covers one parent and exactly one child, and is only used when a single child is assigned to that parent; “Employee + children” covers one parent and their allocated children; “Full family” covers both parents and all children. If your employer charges the family rate for employee + children, add an employee + children entry with that rate and its applicable limits. Spouse exclusions, age-based eligibility, dual coverage, midyear changes, and different plan-year dates are not modeled.</p><p>Learn more: <a href="https://www.healthcare.gov/glossary/deductible/" target="_blank" rel="noreferrer">Deductibles</a> and <a href="https://www.healthcare.gov/glossary/out-of-pocket-maximum-limit/" target="_blank" rel="noreferrer">out-of-pocket limits</a> at HealthCare.gov.</p></div></details>
      </section>
      <footer><a class="brand" href="#">${icon('shield', 19)} CoverCompare.</a><span>A little less guesswork. A little more peace of mind.</span><button id="load-examples">Load example plans</button></footer>
    </main>
    <dialog id="share-dialog" aria-labelledby="share-title"></dialog>
    <dialog id="plan-dialog" aria-labelledby="dialog-title"></dialog>
    <dialog id="confirm-dialog" class="confirm-dialog" aria-labelledby="confirm-title"></dialog>
    <div class="sr-only" id="announcement" role="status" aria-live="polite"></div>
  `
  renderResults()
  bindEvents()
}

function planRow(plan: Plan, owner: Parent) {
  return `<button class="plan-row ${plan.previous ? 'previous-plan' : ''}" data-edit="${escape(plan.id)}" aria-label="Edit ${escape(plan.name)}, ${escape(coverageLabels[plan.coverage])}, ${escape(state.household[owner])}${plan.previous ? ", last year's plan" : ''}"><span class="plan-details"><span class="coverage-name">${coverageLabels[plan.coverage]}${plan.previous ? '<span class="prior-tag">Last year</span>' : ''}</span><span class="plan-subtitle">${escape(plan.employer)} · ${escape(plan.name)}</span></span><span class="plan-rate"><strong>${money(plan.premium * plan.periods)}<small> / yr</small></strong><span>${money(plan.premium)} × ${plan.periods} payments</span></span><span class="edit-icon">${icon('edit', 15)}</span></button>`
}

function employerCard(owner: Parent) {
  const owned = state.plans.filter((plan) => plan.owner === owner)
  const plans = owned.filter((plan) => !plan.previous)
  const prior = owned.find((plan) => plan.previous)
  return `<article class="employer-card ${owner}"><div class="employer-header"><div class="employer-avatar">${icon('building', 23)}</div><div><h3>${escape(state.household[owner])}'s options</h3><span>${plans.length} coverage ${plans.length === 1 ? 'option' : 'options'}${prior ? ' · 1 prior year' : ''}</span></div><button class="icon-button" data-add="${owner}" aria-label="Add a plan for ${escape(state.household[owner])}">${icon('plus', 19)}</button></div>
    <div class="plan-list">${plans.length ? plans.map((plan) => planRow(plan, owner)).join('') : `<div class="empty-plans"><p>No plans yet.</p><span>Add an employee-only, family, or employee + children option to start comparing.</span><button class="text-button" data-add="${owner}">Add first plan ${icon('arrow', 15)}</button></div>`}${prior ? planRow(prior, owner) : ''}</div>
    <div class="employer-footer">${icon('info', 14)} Select a plan to edit premiums and coverage limits.</div></article>`
}

function renderPeriodicCosts(result: Comparison, key: Metric) {
  const costs = periodicCosts(result, key)
  const combined = result.enrollments.length > 1 && costs.paychecks.length === 1
  return `<div class="periodic-costs"><span>${money(costs.monthly)} / month</span>${costs.paychecks
    .map(
      (paycheck) =>
        `<span${combined ? ' title="combined"' : ''}>${paycheck.owner ? `${escape(state.household[paycheck.owner])}: ` : ''}${money(paycheck.amount)} / ${combined ? 'per pp' : 'paycheck'} <small>(${paycheck.periods}/yr)</small></span>`,
    )
    .join('')}</div>`
}

function renderResults() {
  const results = comparePlans(state.household, state.plans).sort((a, b) => a[metric] - b[metric])
  const container = document.querySelector<HTMLDivElement>('#results')!
  // Flag the plans in the lowest-cost combination so the print layout can
  // highlight them in the "Your available plans" section up top.
  const winningPlans = new Set(
    results[0]?.enrollments.map((enrollment) => enrollment.plan.id) ?? [],
  )
  document
    .querySelectorAll<HTMLButtonElement>('.plan-row')
    .forEach((row) =>
      row.classList.toggle('winning-plan', winningPlans.has(row.dataset.edit ?? '')),
    )
  if (!results.length) {
    container.innerHTML = `<div class="empty-results">${icon('people', 32)}<h3>Let's get everyone covered.</h3><p>Add a full-family plan, or compatible employee-only and employee + children plans from both parents, to see your comparisons.${state.household.children === 0 ? ' For two adults, employee + spouse works too.' : ''}</p><button class="button secondary" id="empty-add">${icon('plus', 16)} Add a plan</button></div>`
    document.querySelector('#empty-add')?.addEventListener('click', () => openPlan())
    return
  }
  const best = results[0]!
  const tied = results.filter((result) => Math.abs(result[metric] - best[metric]) < 0.005)
  const worst = results[results.length - 1]!
  const prior = previousComparison(state.household, state.plans)
  // Signed change from last year's cost to a scenario, for the given metric.
  const change = (result: Comparison, key: Metric) => result[key] - prior![key]
  // Each column compares last year against the cheapest option for that column,
  // which is not always the row ranked first under the selected scenario.
  const lowest = (key: Metric) =>
    results.reduce((cheapest, result) => (result[key] < cheapest[key] ? result : cheapest))
  const delta = (key: Metric) => {
    const difference = change(lowest(key), key)
    const percent = prior![key] ? Math.abs((difference / prior![key]) * 100) : 0
    return `<span class="delta ${difference > 0.005 ? 'up' : difference < -0.005 ? 'down' : 'flat'}">Lowest this year ${difference > 0.005 ? '+' : difference < -0.005 ? '−' : ''}${money(Math.abs(difference))}${prior![key] ? ` (${percent.toFixed(1)}%)` : ''}</span>`
  }
  const metricLabels = {
    netPremium: 'premiums minus HSA Match',
    deductible: 'everyone meets the deductible',
    maximum: 'everyone reaches the out-of-pocket limit',
  }
  container.innerHTML = `
    <div class="scenario-tabs" role="group" aria-label="Rank combinations by scenario">
      ${(
        [
          ['netPremium', 'Premiums − HSA Match', 'Your net annual baseline'],
          ['deductible', 'Deductibles reached', 'A year with more care'],
          ['maximum', 'Out-of-pocket max', 'A major medical year'],
        ] as const
      )
        .map(
          ([key, title, description], index) =>
            `<button class="scenario-tab ${metric === key ? 'selected' : ''}" data-metric="${key}" aria-pressed="${metric === key}"><span class="tab-number">0${index + 1}</span><span><strong>${title}</strong><small>${description}</small></span>${metric === key ? icon('check', 18) : ''}</button>`,
        )
        .join('')}
    </div>
    <div class="recommendation"><span class="recommendation-icon">${icon('leaf', 25)}</span><div><div class="recommendation-label">${tied.length > 1 ? `${tied.length} COMBINATIONS TIED FOR LOWEST COST` : 'LOWEST COST FOR THIS SCENARIO'}</div><h3>${escape(best.title)}</h3><p>${worst[metric] > best[metric] ? `${money(worst[metric] - best[metric])} less per year than the highest-cost option` : 'All available combinations have the same cost'} · ${metricLabels[metric]}</p></div><div class="recommendation-total">${money(best[metric])}<span>annual total after HSA Match</span></div>${
      prior
        ? `<div class="prior-delta"><span>VS LAST YEAR</span><strong class="${change(best, metric) > 0.005 ? 'up' : change(best, metric) < -0.005 ? 'down' : 'flat'}">${change(best, metric) > 0.005 ? '+' : change(best, metric) < -0.005 ? '−' : ''}${money(Math.abs(change(best, metric)))}</strong><small>${money(prior[metric])} last year</small></div>`
        : ''
    }</div>
    <div class="table-toolbar"><span><strong>${results.length}</strong> eligible combinations</span><span>Sorted by ${metric === 'netPremium' ? 'premiums minus HSA Match' : metric === 'deductible' ? 'deductible scenario' : 'out-of-pocket scenario'} ↑</span></div>
    <div class="comparison-scroll" tabindex="0" role="region" aria-label="Side-by-side annual cost comparison">
      <table><thead><tr><th scope="col">Coverage combination</th><th scope="col" class="${metric === 'netPremium' ? 'active-column' : ''}">Net annual baseline<small>Premiums − HSA Match</small></th><th scope="col" class="${metric === 'deductible' ? 'active-column' : ''}">Deductibles reached<small>Premiums + deductibles − match</small></th><th scope="col" class="${metric === 'maximum' ? 'active-column' : ''}">Out-of-pocket max<small>Premiums + OOP limits − match</small></th></tr></thead><tbody>
      ${results
        .map(
          (result, index) =>
            `<tr class="${Math.abs(result[metric] - best[metric]) < 0.005 ? 'best-row' : ''}"><th scope="row"><div class="combination-title"><span class="rank">${index + 1}</span><strong>${escape(result.title)}</strong>${Math.abs(result[metric] - best[metric]) < 0.005 ? '<span class="best-tag">Lowest</span>' : ''}</div><div class="enrollments">${result.enrollments.map((enrollment) => `<div><span class="owner-dot ${enrollment.plan.owner}"></span>${escape(enrollment.description)} <span class="enrollment-plan">· ${escape(enrollment.plan.employer)} / ${escape(enrollment.plan.name)}</span></div>`).join('')}</div><details class="cost-details"><summary>View calculation</summary><div>${result.enrollments
              .map((enrollment) => {
                const cost = planCosts(enrollment.plan, enrollment.members)
                return `<p><strong>${escape(enrollment.plan.name)} · ${coverageLabels[enrollment.plan.coverage]}</strong><br>${enrollment.members} covered · ${money(enrollment.plan.premium)} × ${enrollment.plan.periods} = ${money(cost.premium)} premiums<br>Deductible exposure: ${money(cost.deductibleExposure)}${enrollment.plan.aggregateDeductible && enrollment.members > 1 ? ' (aggregate)' : ''}<br>Out-of-pocket exposure: ${money(cost.maximumExposure)}${enrollment.plan.notes ? `<br>Notes: ${escape(enrollment.plan.notes)}` : ''}</p>`
              })
              .join(
                '',
              )}<p>Annual premiums: <strong>${money(result.premium)}</strong><br>HSA Match: <strong>−${money(result.contribution)}/year</strong> (deducted once from each scenario total).</p></div></details></th>${(['netPremium', 'deductible', 'maximum'] as Metric[]).map((key) => `<td class="${metric === key ? 'active-column' : ''}"><strong>${money(result[key])}</strong>${renderPeriodicCosts(result, key)}<span>${key === 'netPremium' ? `${money(result.premium)} premiums` : `+ ${money(key === 'deductible' ? result.deductibleExposure : result.maximumExposure)} in care`}</span>${key === 'netPremium' ? `<span>− ${money(result.contribution)} HSA Match</span>` : ''}${metric === key ? `<div class="cost-bar"><i style="width:${worst[metric] > Math.min(0, best[metric]) ? ((result[metric] - Math.min(0, best[metric])) / (worst[metric] - Math.min(0, best[metric]))) * 100 : 0}%"></i></div>` : ''}</td>`).join('')}</tr>`,
        )
        .join('')}
      ${
        prior
          ? `<tr class="prior-row"><th scope="row"><div class="combination-title"><span class="rank prior-rank">${icon('history', 14)}</span><strong>${escape(prior.title)}</strong><span class="prior-tag">Last year</span></div><div class="enrollments">${prior.enrollments.map((enrollment) => `<div><span class="owner-dot ${enrollment.plan.owner}"></span>${escape(enrollment.description)} <span class="enrollment-plan">· ${escape(enrollment.plan.employer)} / ${escape(enrollment.plan.name)}</span></div>`).join('')}</div></th>${(['netPremium', 'deductible', 'maximum'] as Metric[]).map((key) => `<td class="${metric === key ? 'active-column' : ''}"><strong>${money(prior[key])}</strong>${renderPeriodicCosts(prior, key)}${delta(key)}</td>`).join('')}</tr>`
          : ''
      }
      </tbody></table>
    </div><p class="results-note">${icon('info', 15)}${prior ? " Last year's coverage is priced with this year's household and is never ranked as an option; it is a reference point for rate changes." : ''} Estimates for covered, in-network care over one full year. Actual costs depend on the care you use. All totals subtract the expected annual HSA Match. This values the employer deposit; it does not reduce payroll premiums. A negative total means the match exceeds modeled costs. Monthly and per-paycheck figures spread the net annual total evenly for budgeting; they are not actual payroll deductions or a medical bill schedule. Different payment schedules are shown separately by parent.</p>
  `
  container.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((button) =>
    button.addEventListener('click', () => {
      metric = button.dataset.metric as Metric
      renderResults()
      container
        .querySelector<HTMLButtonElement>(`[data-metric="${metric}"]`)
        ?.focus({ preventScroll: true })
      document.querySelector('#announcement')!.textContent = `Ranked by ${metricLabels[metric]}.`
    }),
  )
}

// Keep typing uninterrupted when household changes refresh the comparisons.
function refreshHouseholdInput(input: HTMLInputElement) {
  const start = input.selectionStart
  const end = input.selectionEnd
  persist()
  render()
  const replacement = document.getElementById(input.id) as HTMLInputElement
  replacement.focus({ preventScroll: true })
  if (start !== null && end !== null) replacement.setSelectionRange(start, end)
}

function bindEvents() {
  document.querySelector('#share')!.addEventListener('click', openShare)
  document.querySelector('#dismiss-notice')?.addEventListener('click', () => {
    shareNotice = ''
    render()
  })
  document.querySelector('#add-plan')!.addEventListener('click', () => openPlan())
  document
    .querySelectorAll<HTMLButtonElement>('[data-add]')
    .forEach((button) =>
      button.addEventListener('click', () => openPlan(undefined, button.dataset.add as Parent)),
    )
  document
    .querySelectorAll<HTMLButtonElement>('[data-edit]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        openPlan(state.plans.find((plan) => plan.id === button.dataset.edit)),
      ),
    )
  for (const owner of ['first', 'second'] as Parent[]) {
    document
      .querySelector<HTMLInputElement>(`#${owner}-parent`)!
      .addEventListener('input', (event) => {
        const input = event.target as HTMLInputElement
        if (!input.value.trim()) {
          input.value = state.household[owner]
          return
        }
        state.household[owner] = input.value
        refreshHouseholdInput(input)
      })
  }
  document.querySelector('#children')!.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement
    if (input.value === '' || !input.checkValidity()) {
      return
    }
    state.household.children = Number(input.value)
    refreshHouseholdInput(input)
  })
  document.querySelector('#children')!.addEventListener('blur', (event) => {
    ;(event.target as HTMLInputElement).value = String(state.household.children)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-children]').forEach((button) =>
    button.addEventListener('click', () => {
      state.household.children = Math.max(
        0,
        Math.min(20, state.household.children + Number(button.dataset.children)),
      )
      persist()
      render()
      document
        .querySelector<HTMLButtonElement>(`[data-children="${button.dataset.children}"]`)
        ?.focus({ preventScroll: true })
    }),
  )
  document.querySelector('#start-fresh')?.addEventListener('click', () =>
    confirmAction(
      'Start with your own plans?',
      'This removes all current plan entries and keeps your household details.',
      'Start fresh',
      () => {
        state.plans = []
        state.sample = false
        persist()
        render()
        openPlan()
      },
    ),
  )
  document.querySelector('#load-examples')!.addEventListener('click', () =>
    confirmAction(
      'Load example plans?',
      'This replaces your saved plans and household with the sample family. Export any results you want to keep first.',
      'Load examples',
      () => {
        state = sampleState()
        persist()
        render()
      },
    ),
  )
  document.querySelector('#export')!.addEventListener('click', exportResults)
  document.querySelector('#print')!.addEventListener('click', () => window.print())
}

function confirmAction(title: string, description: string, action: string, onConfirm: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!
  dialog.innerHTML = `<h2 id="confirm-title">${title}</h2><p>${description}</p><div class="dialog-actions"><button class="button secondary" id="cancel-confirm" autofocus>Cancel</button><button class="button primary" id="accept-confirm">${action}</button></div>`
  dialog.querySelector('#cancel-confirm')!.addEventListener('click', () => dialog.close())
  dialog.querySelector('#accept-confirm')!.addEventListener('click', () => {
    dialog.close()
    onConfirm()
  })
  dialog.showModal()
}

function openPlan(existing?: Plan, owner: Parent = 'first') {
  const plan: Plan = existing ?? {
    id: crypto.randomUUID(),
    name: '',
    employer: '',
    owner,
    coverage: 'family',
    premium: 0,
    periods: 26,
    individualDeductible: 0,
    familyDeductible: 0,
    aggregateDeductible: false,
    individualMaximum: 0,
    familyMaximum: 0,
    contribution: 0,
    notes: '',
    previous: false,
  }
  const dialog = document.querySelector<HTMLDialogElement>('#plan-dialog')!
  const numberField = (key: keyof Plan, label: string, help = '') =>
    `<label>${label}<span class="money-field"><span>$</span><input name="${key}" type="number" min="0" max="10000000" step="0.01" value="${existing ? plan[key] : ''}" placeholder="0" required></span>${help ? `<small>${help}</small>` : ''}</label>`
  dialog.innerHTML = `<form id="plan-form"><div class="dialog-header"><div><div class="section-kicker">COVERAGE DETAILS</div><h2 id="dialog-title">${existing ? 'Edit your plan' : 'Add a plan option'}</h2><p class="dialog-intro">One entry per coverage tier. Copy the amounts from your benefits guide.</p></div><button class="icon-button" type="button" id="close-dialog" aria-label="Close plan editor">${icon('close')}</button></div>
    <div class="form-grid identity"><label>Plan name<input name="name" maxlength="80" value="${escape(plan.name)}" placeholder="e.g. Choice PPO" required></label><label>Employer<input name="employer" maxlength="80" value="${escape(plan.employer)}" placeholder="e.g. Acme Co." required></label><label>Employee<select name="owner">${(['first', 'second'] as Parent[]).map((parent) => `<option value="${parent}" ${plan.owner === parent ? 'selected' : ''}>${escape(state.household[parent])}</option>`).join('')}</select></label><label>Who does this tier cover?<select name="coverage">${Object.entries(
      coverageLabels,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${plan.coverage === key ? 'selected' : ''}>${label}</option>`,
      )
      .join('')}</select></label></div>
    <label class="checkbox-label"><input name="previous" type="checkbox" ${plan.previous ? 'checked' : ''}><span>This was last year's plan<small>Reference only, never ranked as an option. One per person.</small></span></label>
    <h3 class="form-heading">Premiums <span>Your share, including surcharges</span><span class="annual-preview">Annual <strong id="annual-preview">${money(plan.premium * plan.periods)}</strong></span></h3><div class="form-grid premiums">${numberField('premium', 'Premium per payment')}<label>Payment schedule<select id="schedule"><option value="12" ${plan.periods === 12 ? 'selected' : ''}>Monthly · 12 per year</option><option value="24" ${plan.periods === 24 ? 'selected' : ''}>Twice monthly · 24 per year</option><option value="26" ${plan.periods === 26 ? 'selected' : ''}>Every 2 weeks · 26 per year</option><option value="52" ${plan.periods === 52 ? 'selected' : ''}>Weekly · 52 per year</option><option value="custom" ${![12, 24, 26, 52].includes(plan.periods) ? 'selected' : ''}>Custom number of payments</option></select></label><label id="custom-periods" ${[12, 24, 26, 52].includes(plan.periods) ? 'hidden' : ''}>Payments per year<input name="periods" type="number" min="1" max="366" step="1" value="${plan.periods}" required></label></div>
    <div class="form-columns"><section><h3 class="form-heading">Deductible <span>Annual, in-network</span></h3><div class="form-grid">${numberField('individualDeductible', 'Per person', 'Use the per-person limit for this tier.')}<div class="family-field">${numberField('familyDeductible', 'All covered members')}</div></div><label class="checkbox-label family-field"><input name="aggregateDeductible" type="checkbox" ${plan.aggregateDeductible ? 'checked' : ''}><span>Aggregate family deductible<small>The full family amount applies before benefits begin, rather than per-person deductibles.</small></span></label></section><section><h3 class="form-heading">Out-of-pocket maximum <span>Annual, in-network</span></h3><div class="form-grid">${numberField('individualMaximum', 'Per person')}<div class="family-field">${numberField('familyMaximum', 'All covered members')}</div></div></section></div>
    <h3 class="form-heading">A little more context <span>Optional</span></h3><div class="form-grid">${numberField('contribution', 'HSA Match', 'Expected employer deposit per year. Enter what you expect to receive, not your own contributions. Deducted from every total.')}<label>Notes<textarea name="notes" rows="2" maxlength="1000" placeholder="Network, prescriptions, spouse eligibility…">${escape(plan.notes)}</textarea></label></div>
    <p class="form-error" id="form-error" role="alert" hidden></p><div class="dialog-actions">${existing ? '<button class="delete-button" id="delete-plan" type="button">Delete plan</button>' : ''}<button class="button secondary" type="button" id="cancel-dialog">Cancel</button><button class="button primary" type="submit">${existing ? 'Save changes' : 'Add plan'} ${icon('check', 16)}</button></div></form>`
  const form = dialog.querySelector<HTMLFormElement>('form')!
  const funding = form.elements.namedItem('contribution') as HTMLInputElement
  funding.required = false
  const periods = form.elements.namedItem('periods') as HTMLInputElement
  const premium = form.elements.namedItem('premium') as HTMLInputElement
  const preview = () => {
    dialog.querySelector('#annual-preview')!.textContent = money(
      Number(premium.value) * Number(periods.value),
    )
  }
  dialog.querySelector('#schedule')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value
    dialog.querySelector<HTMLElement>('#custom-periods')!.hidden = value !== 'custom'
    if (value !== 'custom') periods.value = value
    preview()
  })
  premium.addEventListener('input', preview)
  periods.addEventListener('input', preview)
  const coverage = form.elements.namedItem('coverage') as HTMLSelectElement
  const updateCoverage = () => {
    form.querySelectorAll<HTMLElement>('.family-field').forEach((field) => {
      field.hidden = coverage.value === 'individual'
      field.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        input.disabled = coverage.value === 'individual'
      })
    })
  }
  coverage.addEventListener('change', updateCoverage)
  updateCoverage()
  dialog.querySelector('#close-dialog')!.addEventListener('click', () => dialog.close())
  dialog.querySelector('#cancel-dialog')!.addEventListener('click', () => dialog.close())
  dialog.querySelector('#delete-plan')?.addEventListener('click', () => {
    confirmAction(
      'Delete this plan?',
      `${escape(plan.name)} · ${coverageLabels[plan.coverage]} will be removed from your comparisons.`,
      'Delete plan',
      () => {
        state.plans = state.plans.filter((item) => item.id !== plan.id)
        persist()
        dialog.close()
        render()
      },
    )
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const amount = (key: string) => Number(data.get(key))
    const updated: Plan = {
      id: plan.id,
      name: String(data.get('name')).trim(),
      employer: String(data.get('employer')).trim(),
      owner: data.get('owner') as Parent,
      coverage: data.get('coverage') as Coverage,
      premium: amount('premium'),
      periods: amount('periods'),
      individualDeductible: amount('individualDeductible'),
      familyDeductible: amount('familyDeductible'),
      aggregateDeductible: data.get('aggregateDeductible') === 'on',
      individualMaximum: amount('individualMaximum'),
      familyMaximum: amount('familyMaximum'),
      contribution: amount('contribution'),
      notes: String(data.get('notes')).trim(),
      previous: data.get('previous') === 'on',
    }
    const duplicatePrior =
      updated.previous &&
      state.plans.some(
        (item) => item.id !== updated.id && item.previous && item.owner === updated.owner,
      )
    const error = duplicatePrior
      ? `${state.household[updated.owner]} already has a plan marked as last year's. Only one is allowed per person.`
      : validatePlan(updated)
    if (error) {
      const errorElement = dialog.querySelector<HTMLElement>('#form-error')!
      errorElement.textContent = error
      errorElement.hidden = false
      return
    }
    state.plans = existing
      ? state.plans.map((item) => (item.id === plan.id ? updated : item))
      : [...state.plans, updated]
    persist()
    dialog.close()
    render()
    document
      .querySelector<HTMLButtonElement>(`[data-edit="${CSS.escape(updated.id)}"]`)
      ?.focus({ preventScroll: true })
  })
  dialog.showModal()
}

function openShare() {
  const dialog = document.querySelector<HTMLDialogElement>('#share-dialog')!
  let url: string
  try {
    url = createShareUrl(state, metric, location.href)
  } catch (error) {
    shareNotice = error instanceof Error ? error.message : 'Could not create a share link.'
    render()
    return
  }
  const localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  dialog.innerHTML = `<div class="dialog-header"><h2 id="share-title">Share your comparison</h2><button class="icon-button" id="close-share" aria-label="Close share dialog">${icon('close')}</button></div>
    <p class="dialog-intro">This link includes your household, every plan, HSA matches, notes, and the selected scenario. It shares a snapshot; future edits won't change a link you've already sent.</p>
    <label>Comparison link<textarea id="share-url" rows="4" readonly spellcheck="false"></textarea></label>
    <p class="share-help">Anyone with this link can read the included data. Opening it replaces the recipient's current comparison and saves it in their browser.</p>
    ${localOnly ? '<p class="share-help">This app is running on localhost. To open the link on another device, the app needs to be hosted at an address both of you can reach. The data is already included in the link.</p>' : ''}
    ${url.length > 8000 ? '<p class="share-help">This is a long link. Some messaging apps may truncate it; make sure to copy the entire link.</p>' : ''}
    <div class="dialog-actions"><span id="copy-status" role="status"></span><button class="button primary" id="copy-share">Copy link</button></div>`
  const input = dialog.querySelector<HTMLTextAreaElement>('#share-url')!
  input.value = url
  dialog.querySelector('#close-share')!.addEventListener('click', () => dialog.close())
  dialog.querySelector('#copy-share')!.addEventListener('click', async () => {
    const status = dialog.querySelector<HTMLElement>('#copy-status')!
    try {
      await navigator.clipboard.writeText(url)
      status.textContent = 'Link copied!'
    } catch {
      input.focus()
      input.select()
      status.textContent = 'Press Ctrl+C or ⌘C to copy the selected link.'
    }
  })
  dialog.showModal()
}

// Handle a shared link pasted into an already-open calculator as well.
window.addEventListener('hashchange', () => {
  const incoming = readShareHash(location.hash)
  if (incoming.kind === 'none') return
  if (incoming.kind === 'valid') {
    state = incoming.state
    metric = incoming.metric
    persist()
    shareNotice = 'Shared comparison loaded. Edits are saved in this browser.'
  } else {
    shareNotice = 'This share link is invalid or incomplete. Your saved comparison has been kept.'
  }
  // Consume the snapshot so a later reload won't undo edits made after import.
  history.replaceState(null, '', location.pathname + location.search)
  render()
})

function exportResults() {
  const rows: (string | number)[][] = [
    [
      'Coverage combination',
      'Enrollments',
      'Annual premiums before HSA Match (USD)',
      'Premiums - HSA Match (USD)',
      'Premiums + deductible exposure - HSA Match (USD)',
      'Premiums + OOP exposure - HSA Match (USD)',
      'HSA Match (USD; deducted once per scenario)',
      'Example data',
    ],
  ]
  for (const result of comparePlans(state.household, state.plans).sort(
    (a, b) => a[metric] - b[metric],
  )) {
    rows.push([
      result.title,
      result.enrollments
        .map(
          (e) =>
            `${e.description}: ${e.plan.employer} / ${e.plan.name} (${coverageLabels[e.plan.coverage]})`,
        )
        .join('; '),
      ...[
        result.premium,
        result.netPremium,
        result.deductible,
        result.maximum,
        result.contribution,
      ].map((value) => Number(value.toFixed(2))),
      state.sample ? 'Includes example plans' : 'No',
    ])
  }
  const prior = previousComparison(state.household, state.plans)
  if (prior) {
    rows.push([
      `${prior.title} (reference only, not ranked)`,
      prior.enrollments
        .map(
          (e) =>
            `${e.description}: ${e.plan.employer} / ${e.plan.name} (${coverageLabels[e.plan.coverage]})`,
        )
        .join('; '),
      ...[prior.premium, prior.netPremium, prior.deductible, prior.maximum, prior.contribution].map(
        (value) => Number(value.toFixed(2)),
      ),
      state.sample ? 'Includes example plans' : 'No',
    ])
  }
  // Prevent spreadsheet programs from evaluating user-entered text as formulas.
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const text =
            typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? `'${value}` : String(value)
          return `"${text.replaceAll('"', '""')}"`
        })
        .join(','),
    )
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'covercompare-comparison.csv'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

persist()
render()
