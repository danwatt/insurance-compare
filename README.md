# CoverCompare

A single-page family health-insurance calculator, built with Vite and plain TypeScript. No UI framework, backend, or account is required.

## Run locally

Use Node.js 24 or later (the tests use Node's built-in TypeScript support).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The initial six plans are **fictional examples**. Choose **Start with my plans** to replace them with your own rates.

```sh
npm test          # Calculation and eligibility tests
npm run build    # Type-check and build to dist/
npm run preview  # Serve the production build locally
```

## Where the code lives

| File                       | Responsibility                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/calculator.ts`        | Data types, eligibility, validation, and cost calculations. Pure functions with no browser dependencies. |
| `src/state.ts`             | Example plans and validated localStorage persistence.                                                    |
| `src/main.ts`              | Page rendering, plan editor, event handlers, and CSV export. Start with `render()`.                      |
| `src/style.css`            | Colors, layout, components, and responsive styles.                                                       |
| `tests/calculator.test.ts` | Tests for family caps, split enrollment, invalid inputs, and edge cases.                                 |

When a user changes a plan, the event handler updates `state`, saves it to localStorage, and renders the page again. Scenario buttons rerender only the comparison. Vite automatically updates the browser while you edit source files.

## Entering plans

The plan editor lays out identity, premiums, deductible, out-of-pocket maximum, and optional context on a single screen, with the action buttons pinned to the bottom of the dialog. Add one entry for each enrollment tier, including its employee premium and annual limits. The same benefit plan can have separate employee-only, employee + spouse, employee + one child, employee + children, and full-family entries. This allows each tier to have different deductibles, limits, and employer funding.

The household consists of two parents and zero to twenty children. Each parent belongs to one employer's coverage in split arrangements. Every combination covers the entire household once. The calculator tries both whole-family options and every possible allocation of children across the parents' employee-only / employee + one child / employee + children tiers, including multiple benefit-plan alternatives.

If an employer uses the family rate for a parent plus children, enter an employee + children option at that rate. An employee + one child entry is only used when exactly one child is assigned to that parent, so it can matter for a two-child family with one child on each parent's plan. Full-family entries represent both parents and all children. Employee + spouse entries apply when there are no children.

### Last year's plan

Any entry can be marked **This was last year's plan**, with at most one such entry per parent. Prior-year entries are reference points for rate changes: they are never offered as a combination and never ranked. They appear at the end of their employer card and as a final reference row in the comparison table, and the recommendation card shows the change between last year's total and the lowest current option for the selected scenario. Each comparison column reports the change against the cheapest option for that column, which is not always the row ranked first.

Prior-year coverage is priced with this year's household and each entry's own coverage tier: employee only covers one person, employee + spouse and employee + one child cover two, employee + children covers that parent plus every child, and full family covers everyone. When both parents have a prior-year entry, their costs are added together, so enter only the coverage each parent actually carried.

## Calculations

- Annual premiums = employee premium × annual payment count.
- Embedded deductible exposure = the lesser of per-person deductible × covered members and the family deductible. For one member, use the individual amount.
- Aggregate deductible exposure = the family deductible for multi-member coverage.
- Out-of-pocket exposure = the lesser of per-person maximum × covered members and the family maximum. For one member, use the individual amount.
- Deductible exposure is capped by the applicable out-of-pocket exposure.
- Net annual baseline = premiums − HSA Match.
- Deductible scenario = premiums + deductible exposure − HSA Match.
- Major medical scenario = premiums + out-of-pocket exposure − HSA Match. The deductible is already included in this exposure, so it is not added again.
- Split plans calculate each enrollment separately, then add their costs.
- Last year's coverage uses the same formulas and the same HSA Match handling, but is excluded from the ranked combinations.
- Each comparison cell shows its net annual total, monthly equivalent (annual ÷ 12), and per-paycheck equivalent. Matching payment schedules use the combined annual total divided by that payment count. Different schedules show each parent's enrollment cost divided by that plan's payment count. These are evenly spread budget equivalents, including HSA Match and scenario medical costs, rather than actual paycheck deductions or medical bill timing. Displayed equivalents are rounded to cents; annual rankings use the annual totals.
- HSA Match is the expected annual employer HSA contribution, including automatic deposits. For conditional matching, enter what you expect to receive based on your contributions. Do not enter your own HSA contributions or an HRA reimbursement allowance.
- Each scenario subtracts the match once per enrollment, including both employers for split coverage. Ranking uses these net totals. Actual annual premiums and the match remain visible in the breakdown and CSV export.
- The subtraction represents the economic value of the HSA deposit, even if saved for future care; it does not reduce actual payroll deductions. Net totals can be negative when the match exceeds modeled costs. The existing stored `contribution` field is retained so previously entered amounts are preserved; review any amounts previously entered as HRA funding.

These scenarios cover one full plan year of covered, in-network care. They do not predict usage, model copays/coinsurance beyond the deductible, or include out-of-network costs, excluded services, taxes, midyear changes, or separate prescription accumulators. Out-of-pocket limits are assumed to be embedded. Verify applicable per-person limits, eligibility, and any spouse exclusions in the plan documents. Include applicable surcharges in the premium and capture network/prescription details in notes.

Background: [HealthCare.gov deductibles](https://www.healthcare.gov/glossary/deductible/) and [out-of-pocket limits](https://www.healthcare.gov/glossary/out-of-pocket-maximum-limit/).

## Persistence and export

**Share comparison** generates a URL containing a snapshot of the household, all plan fields (including notes and HSA Match), and the selected scenario. **Copy link** copies it; if clipboard access fails, the dialog selects the URL for manual copying. Links use versioned UTF-8 JSON encoded as URL-safe base64 in the `#share=` fragment, which is not sent to the web server. This is not encryption: anyone with the link can read its data.

Opening a valid share link replaces the current comparison and saves the imported data locally. The app then removes the snapshot from the address bar so reloads restore subsequent local edits instead of reimporting old data. Invalid links keep existing saved data and display an error. Ordinary section links continue to work. Sharing is a snapshot, not live synchronization.

For sharing across devices, host the app at an address both people can reach. A `localhost` or `127.0.0.1` link points to the recipient's own computer. No hosting or data backend is configured by this feature. Very long notes produce long links; the dialog flags links over 8,000 characters because messaging tools may truncate them.

`src/share.ts` handles encoding/decoding, while `src/state.ts` validates both local and shared data. `tests/share.test.ts` covers Unicode, snapshots, invalid links, and storage persistence/failures.

**Print / Save PDF** opens the browser's print dialog. A print stylesheet reduces the page to the household inputs, the plan list, and the full comparison table (all three scenarios at once), dropping the site chrome, tabs, per-row calculation details, and explanatory sections so the inputs and results fit together. Text prints in near-black on near-white for contrast, and the one or two plans in the lowest-cost combination for the selected scenario are highlighted in the plan list. Any prior-year row prints with its annual totals and change figures; its monthly and per-paycheck equivalents are dropped so the page still fits.

Plan data is stored only in this browser's localStorage under `family-plan-comparison-v1`; there is no server upload. The UI reports if saving fails. Clearing browser data clears saved plans. CSV export contains gross annual premiums, net scenario totals, coverage assignments, and the HSA Match, with any prior-year coverage as a final reference row. It is intended for reviewing results rather than restoring plan inputs. Fonts load from Google Fonts, with local sans-serif fallbacks.
