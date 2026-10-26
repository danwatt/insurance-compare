import type { Comparison } from './calculator'
import {
  annualCostAtSpending,
  assumedCoinsurance,
  findBreakEvens,
  spendingKnots,
} from './breakEven'

const colors = [
  '#275d46',
  '#ac672c',
  '#497bb0',
  '#9864a4',
  '#a7475c',
  '#64853c',
  '#358c91',
  '#74634e',
]
const currency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  )

// View preferences live separately from the household and don't alter plan data.
let selectedIds: string[] = []
let maximum = 100_000
let inspected = 10_000

export function mountBreakEvenChart(container: HTMLElement, allComparisons: Comparison[]) {
  if (!allComparisons.length) {
    container.innerHTML = ''
    return
  }
  const comparisons = [...allComparisons].sort((a, b) => a.id.localeCompare(b.id))
  selectedIds = selectedIds.filter((id) => comparisons.some((c) => c.id === id))
  if (!selectedIds.length)
    selectedIds = [...comparisons]
      .sort((a, b) => a.netPremium - b.netPremium)
      .slice(0, 8)
      .map((c) => c.id)
  const label = (comparison: Comparison) =>
    `${comparison.title} · ${comparison.enrollments.map((e) => `${e.plan.employer} / ${e.plan.name} (${e.members} covered)`).join(' + ')}`

  container.innerHTML = `<div class="section-heading"><div><div class="section-kicker">03 / THE TURNING POINTS</div><h2 id="break-even-heading">When does each option pay off?</h2><p>Explore annual costs as your family's medical spending changes.</p></div></div>
    <div class="break-even-panel">
      <div class="chart-controls"><label>Medical spending range<select id="chart-range">${[25000, 50000, 100000, 250000, 500000, 1000000].map((value) => `<option value="${value}" ${value === maximum ? 'selected' : ''}>$0 – ${currency(value)}</option>`).join('')}</select></label><p>Medical spending = allowed charges before insurance pays.<br>Each family member is assumed to use an equal share of care.</p></div>
      <details class="chart-options"><summary>Choose combinations · <span id="chart-selection-count"></span> of ${comparisons.length} selected (up to 8)</summary><div>${comparisons.map((comparison, index) => `<label><input type="checkbox" data-chart-index="${index}" ${selectedIds.includes(comparison.id) ? 'checked' : ''}><span>${escape(label(comparison))}</span></label>`).join('')}</div><p id="chart-selection-status" role="status"></p></details>
      <p id="chart-assumptions" class="chart-assumptions"></p>
      <div id="chart-plot" class="chart-plot"></div>
      <div id="chart-legend" class="chart-legend"></div>
      <div class="chart-inspector"><label for="chart-spending">Inspect annual medical spending</label><div class="chart-inspector-inputs"><input id="chart-slider" aria-label="Annual household medical spending" type="range" min="0" max="${maximum}" step="100" value="${inspected}"><input id="chart-spending" aria-label="Annual medical spending in dollars" type="number" min="0" max="${maximum}" step="1" value="${inspected}"></div></div>
      <div id="chart-costs" class="chart-costs" aria-live="polite"></div>
      <div id="chart-breakpoints" class="chart-breakpoints"></div>
      <p class="chart-footnote">Model: premiums + deductible and coinsurance costs − annual HSA Match. Medical costs are capped at each enrollment's applicable out-of-pocket limit. All care is subject to the deductible; copays, preventive-care exceptions, separate drug benefits, network price differences, and uneven spending are not modeled. Last year's plans are excluded. Break-even labels are rounded to the nearest dollar. <a href="https://www.healthcare.gov/glossary/co-insurance/" target="_blank" rel="noreferrer">About coinsurance</a>.</p>
    </div>`

  const chosen = () => comparisons.filter((c) => selectedIds.includes(c.id))
  const shortLabel = (comparison: Comparison) =>
    `Option ${chosen().findIndex((c) => c.id === comparison.id) + 1}`
  const byId = (id: string) => comparisons.find((c) => c.id === id)!
  const width = 920,
    height = 370,
    left = 85,
    right = 25,
    top = 40,
    bottom = 65
  const x = (spending: number) => left + (spending / maximum) * (width - left - right)
  let y = (cost: number) => cost

  function updateInspection() {
    const selected = chosen()
    const ranked = selected
      .map((comparison) => ({ comparison, cost: annualCostAtSpending(comparison, inspected) }))
      .sort((a, b) => a.cost - b.cost)
    container.querySelector('#chart-costs')!.innerHTML =
      `<p>At <strong>${currency(inspected)}</strong> in household medical spending:</p><div>${ranked.map(({ comparison, cost }) => `<article><span>${shortLabel(comparison)}${Math.abs(cost - ranked[0]!.cost) < 0.005 ? ' · Lowest cost' : ''}</span><strong>${currency(cost)}<small> / year</small></strong><span>${escape(comparison.title)}</span></article>`).join('')}</div>`
    const cursor = container.querySelector('#chart-cursor')
    cursor?.setAttribute('x1', String(x(inspected)))
    cursor?.setAttribute('x2', String(x(inspected)))
    container.querySelectorAll<SVGCircleElement>('[data-chart-dot]').forEach((dot, index) => {
      dot.setAttribute('cx', String(x(inspected)))
      dot.setAttribute('cy', String(y(annualCostAtSpending(selected[index]!, inspected))))
    })
  }

  function draw() {
    const selected = chosen()
    const { intervals, crossings } = findBreakEvens(selected, maximum)
    container.querySelector('#chart-selection-count')!.textContent = String(selected.length)
    const assumed = [
      ...new Map(
        selected.flatMap((c) => c.enrollments.map((e) => [e.plan.id, e.plan] as const)),
      ).values(),
    ].filter((p) => p.coinsurance === undefined)
    container.querySelector('#chart-assumptions')!.textContent = assumed.length
      ? `Assumption: ${assumedCoinsurance}% patient coinsurance is used for ${assumed.length} selected plan ${assumed.length === 1 ? 'entry' : 'entries'} without a rate. Set “Coinsurance — your share” in the plan editor for a more useful comparison.`
      : 'Using the coinsurance rates entered for the selected plans. Spending is spread equally across all family members.'
    const low = Math.min(0, ...selected.map((c) => annualCostAtSpending(c, 0)))
    const high = Math.max(1, ...selected.map((c) => annualCostAtSpending(c, maximum)))
    const span = high - low || 1
    const minY = low < 0 ? low - span * 0.04 : 0
    const maxY = high + span * 0.08
    y = (cost) => top + ((maxY - cost) / (maxY - minY)) * (height - top - bottom)
    const switches = intervals.slice(1).map((interval) => interval.from)
    container.querySelector('#chart-plot')!.innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Annual cost by medical spending</title><desc id="chart-description">${selected.length} coverage combinations. Dashed vertical markers show where the lowest-cost option changes. Exact modeled costs are available below using the spending control.</desc>
      <text x="${left}" y="18" class="chart-axis-title">Your annual cost, after HSA Match</text>
      ${Array.from({ length: 6 }, (_, i) => {
        const cost = minY + ((maxY - minY) * i) / 5
        return `<line x1="${left}" x2="${width - right}" y1="${y(cost)}" y2="${y(cost)}" class="chart-grid"/><text x="${left - 12}" y="${y(cost) + 4}" text-anchor="end">${currency(cost)}</text>`
      }).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<text x="${x((maximum * i) / 5)}" y="${height - bottom + 25}" text-anchor="middle">${currency((maximum * i) / 5)}</text>`).join('')}
      ${switches.map((spending, i) => `<line x1="${x(spending)}" x2="${x(spending)}" y1="${top}" y2="${height - bottom}" class="chart-switch"/><circle cx="${x(spending)}" cy="${top - 9}" r="9" fill="#e6ecdd"/><text x="${x(spending)}" y="${top - 5}" text-anchor="middle">${i + 1}</text>`).join('')}
      ${selected
        .map(
          (comparison, index) =>
            `<polyline points="${spendingKnots(comparison, maximum)
              .map((spending) => `${x(spending)},${y(annualCostAtSpending(comparison, spending))}`)
              .join(
                ' ',
              )}" fill="none" stroke="${colors[index]}" stroke-width="3" stroke-linejoin="round"><title>${escape(label(comparison))}</title></polyline>`,
        )
        .join('')}
      <line id="chart-cursor" x1="${x(inspected)}" x2="${x(inspected)}" y1="${top}" y2="${height - bottom}" stroke="#334a3b" stroke-dasharray="3 5" opacity=".5"/>
      ${selected.map((comparison, index) => `<circle data-chart-dot="${index}" cx="${x(inspected)}" cy="${y(annualCostAtSpending(comparison, inspected))}" r="4.5" fill="${colors[index]}" stroke="white" stroke-width="2"/>`).join('')}
      <text x="${(width + left - right) / 2}" y="${height - 12}" text-anchor="middle" class="chart-axis-title">Annual household medical spending (allowed charges)</text>
      </svg>`
    container.querySelector('#chart-legend')!.innerHTML = selected
      .map(
        (comparison, index) =>
          `<div><i style="background:${colors[index]}"></i><span><strong>Option ${index + 1}</strong> · ${escape(label(comparison))}</span></div>`,
      )
      .join('')
    container.querySelector('#chart-breakpoints')!.innerHTML =
      `<h3>Lowest-cost options across the range</h3><p>${selected.length === 1 ? 'Select another combination to find break-even points.' : intervals.length === 1 ? 'No change in the lowest-cost option within this spending range.' : 'Numbered chart markers show where the lowest-cost selection changes.'}</p><ol>${intervals.map((interval, index) => `<li><span>${index ? `${index}. ` : ''}${currency(interval.from)} – ${currency(interval.to)} in medical spending</span><strong>${interval.winners.map((id) => shortLabel(byId(id))).join(' + ')}${interval.winners.length > 1 ? ' (tied)' : ''}</strong></li>`).join('')}</ol>
      <details><summary>All pairwise break-even points (${crossings.length})</summary>${crossings.length ? `<ul>${crossings.map((c) => `<li>${shortLabel(byId(c.first))} &amp; ${shortLabel(byId(c.second))}: <strong>${currency(c.spending)}</strong> in medical spending; each costs ${currency(c.cost)} / year.</li>`).join('')}</ul>` : '<p>No isolated crossings in this range. Identical or overlapping segments are not listed as individual points.</p>'}</details>`
    updateInspection()
  }

  container.querySelectorAll<HTMLInputElement>('[data-chart-index]').forEach((input) =>
    input.addEventListener('change', () => {
      const id = comparisons[Number(input.dataset.chartIndex)]!.id
      if (
        (input.checked && selectedIds.length >= 8) ||
        (!input.checked && selectedIds.length === 1)
      ) {
        input.checked = !input.checked
        container.querySelector('#chart-selection-status')!.textContent =
          'Select between 1 and 8 combinations.'
        return
      }
      selectedIds = input.checked
        ? [...selectedIds, id]
        : selectedIds.filter((value) => value !== id)
      container.querySelector('#chart-selection-status')!.textContent = ''
      draw()
    }),
  )
  const slider = container.querySelector<HTMLInputElement>('#chart-slider')!
  const amount = container.querySelector<HTMLInputElement>('#chart-spending')!
  for (const input of [slider, amount])
    input.addEventListener('input', () => {
      if (!input.value || !input.checkValidity()) return
      inspected = Number(input.value)
      if (input !== slider) slider.value = String(inspected)
      if (input !== amount) amount.value = String(inspected)
      updateInspection()
    })
  amount.addEventListener('blur', () => {
    amount.value = String(inspected)
  })
  container
    .querySelector<HTMLSelectElement>('#chart-range')!
    .addEventListener('change', (event) => {
      maximum = Number((event.target as HTMLSelectElement).value)
      inspected = Math.min(inspected, maximum)
      for (const input of [slider, amount]) {
        input.max = String(maximum)
        input.value = String(inspected)
      }
      draw()
    })
  draw()
}
