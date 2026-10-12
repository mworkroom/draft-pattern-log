import { expect, test, type Page } from '@playwright/test'
import { blankDraft, MBTI_OPTIONS, STRUCTURE_KEYS, TYPE_KEYS, TYPE_LABELS, toRecord, type ReviewRecordV1 } from '../src/model'

function makeRecord(name: string, overrides: Partial<ReviewRecordV1> = {}) {
  const draft = blankDraft('2026-10-13')
  draft.studentName = name
  for (const key of STRUCTURE_KEYS) draft.structure[key] = 2
  return { ...toRecord(draft), ...overrides }
}
const base = makeRecord('Mina')
const records = [
  { ...base, id: 'mina-1', mbti: 'xNFJ' as const, reviewDate: '2026-10-10', problemTypes: ['type5', 'type3'] as ReviewRecordV1['problemTypes'], structure: { ...base.structure, logicConnection: 0 }, rework: ['inferHiddenLogic'] as ReviewRecordV1['rework'], notes: 'Connect the experience and motivation.', timeSpent: '60m' as const, revision_experience_closing: 'rebuild' as const },
  makeRecord('Mina', { id: 'mina-2', mbti: 'xNFJ', reviewDate: '2026-10-12', revisionRound: 2, problemTypes: ['type5'], timeSpent: '30m', notes: 'Follow-up wording.' }),
  makeRecord('Jun', { id: 'jun-1', mbti: 'xNTP', problemTypes: ['type5', 'type7'], timeSpent: '120m+' }),
  makeRecord('Legacy', { id: 'legacy-1', problemTypes: ['type3'] }),
  makeRecord('Genre', { id: 'genre-1', mbti: 'xSTJ', problemTypes: ['type6', 'unclassified'], genreMismatchSubtypes: ['researchProposal', 'promptResponse'], unclassifiedNote: 'Repeated prompts.', notes: 'Preserve original notes.' }),
  makeRecord('Other', { id: 'other-1', mbti: 'xNFJ', problemTypes: ['type4'] }),
]

async function seed(page: Page, data = records) {
  await page.goto('./')
  await page.evaluate(value => localStorage.setItem('sop-score-tracker:records:v1', value), JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: data }))
  await page.reload()
}

test('dropdown AND selection is independent, includes unspecified reviews in All, and can clear zero matches', async ({ page }) => {
  await seed(page)
  const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
  const mbti = explorer.getByRole('combobox', { name: 'Explorer MBTI' })
  const type = explorer.getByRole('combobox', { name: 'Explorer Problem Type' })
  const count = explorer.locator('.explorer-selection')
  const total = page.locator('.kpi-card').filter({ hasText: 'Total Reviews' }).locator('strong')
  await expect(mbti.locator('option')).toHaveText(['All groups', ...MBTI_OPTIONS])
  await expect(type.locator('option')).toHaveText(['All types', ...TYPE_KEYS.map(key => TYPE_LABELS[key])])
  await expect(count).toContainText('6 reviews')
  await expect(explorer.locator('.explorer-case-toggle')).toHaveCount(5)
  await explorer.getByRole('button', { name: 'View all', exact: true }).click()
  await expect(explorer.locator('.explorer-case-toggle')).toHaveCount(6)
  await mbti.selectOption('xNFJ')
  await expect(count).toContainText('3 reviews')
  await expect(explorer.locator('.explorer-case-toggle')).toHaveCount(3)
  await type.selectOption('type5')
  await expect(count).toContainText('2 reviews')
  await expect(count).toContainText('Round 1: 1 / Round 2: 1 / Round 3: 0')
  await expect(total).toHaveText('6')
  const patterns = explorer.getByRole('region', { name: 'Draft Patterns', exact: true })
  await expect(patterns).not.toContainText(TYPE_LABELS.type5)
  await expect(patterns).toContainText('1/2 reviews')
  await expect(explorer.locator('.explorer-summary-grid')).not.toContainText('%')
  await explorer.getByText('By round', { exact: true }).click()
  await expect(explorer.locator('.explorer-time')).toContainText('30m–60m')
  await expect(explorer.locator('.explorer-time')).toContainText('Round 1: 60m')
  await expect(explorer.locator('.explorer-time')).toContainText('Round 2: 30m')
  await expect(explorer.locator('.explorer-time')).toContainText('Round 3: —')
  await page.locator('.recent-toolbar').getByRole('combobox', { name: 'Problem Type', exact: true }).selectOption('type7')
  await expect(total).toHaveText('1')
  await expect(count).toContainText('2 reviews')
  await mbti.selectOption('xSFP')
  await expect(explorer).toContainText('No matching reviews')
  await explorer.getByRole('button', { name: 'Clear MBTI', exact: true }).click()
  await expect(type).toHaveValue('type5')
  await expect(count).toContainText('3 reviews')
  await mbti.selectOption('xSFP')
  await explorer.getByRole('button', { name: 'Clear Problem Type', exact: true }).click()
  await expect(mbti).toHaveValue('xSFP')
  await expect(type).toHaveValue('')
  await explorer.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(count).toContainText('6 reviews')
  await expect(explorer.locator('.explorer-summary-grid')).toContainText('%')
  await expect(total).toHaveText('1')
  await expect(explorer.locator('.explorer-case-toggle')).toHaveCount(5)
})

test('read-only cases preserve the draft; Edit protects unsaved changes and updates the existing record', async ({ page }) => {
  await seed(page)
  const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
  await page.locator('#student-name').fill('Unsaved new record')
  const before = await page.evaluate(() => localStorage.getItem('sop-score-tracker:records:v1'))
  await explorer.getByRole('combobox', { name: 'Explorer MBTI' }).selectOption('xNFJ')
  await explorer.getByRole('combobox', { name: 'Explorer Problem Type' }).selectOption('type5')
  await expect(explorer.locator('.explorer-case-toggle').first()).toHaveAttribute('aria-expanded', 'true')
  const mina = explorer.locator('.explorer-case').filter({ hasText: 'Connect the experience and motivation.' })
  await explorer.locator('.explorer-case-toggle').filter({ hasText: 'Round 1' }).click()
  await expect(mina).toContainText('Logic Connection: 0 / 2')
  await expect(mina).toContainText('Experience Closing: rebuild')
  await expect(page.locator('#student-name')).toHaveValue('Unsaved new record')
  expect(await page.evaluate(() => localStorage.getItem('sop-score-tracker:records:v1'))).toBe(before)
  page.once('dialog', dialog => dialog.dismiss())
  await mina.getByRole('button', { name: 'Edit record', exact: true }).click()
  await expect(page.locator('#student-name')).toHaveValue('Unsaved new record')
  page.once('dialog', dialog => dialog.accept())
  await mina.getByRole('button', { name: 'Edit record', exact: true }).click()
  await expect(page.locator('#student-name')).toHaveValue('Mina')
  await expect(page.locator('#student-name')).toBeFocused()
  await expect(page.locator('#short-notes')).toHaveValue('Connect the experience and motivation.')
  await page.locator('#short-notes').fill('Updated evidence notes.')
  await page.getByRole('button', { name: 'Update Review', exact: true }).click()
  await expect(mina).toHaveCount(0)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records)
  expect(stored).toHaveLength(records.length)
  expect(stored.find((record: ReviewRecordV1) => record.id === 'mina-1').notes).toBe('Updated evidence notes.')
  expect(Object.keys(stored[0]).sort()).toEqual(Object.keys(records[0]).sort())
  const followUpToggle = explorer.locator('.explorer-case-toggle').filter({ hasText: 'Round 2' })
  if (await followUpToggle.getAttribute('aria-expanded') === 'false') await followUpToggle.click()
  const followUp = explorer.locator('.explorer-case').filter({ hasText: 'Follow-up wording.' })
  let dialogs = 0
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss() })
  await followUp.getByRole('button', { name: 'Edit record' }).click()
  await expect(page.locator('#short-notes')).toHaveValue('Follow-up wording.')
  expect(dialogs).toBe(0)
})

test('a date-only unsaved change is protected and reverting it allows editing', async ({ page }) => {
  await seed(page)
  const initialDate = await page.locator('#review-date').inputValue()
  await page.locator('#review-date').fill('2026-09-01')
  let dialogs = 0
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss() })
  await page.locator('.reviews-table').getByRole('button', { name: 'Jun', exact: true }).click()
  await expect(page.locator('#student-name')).toHaveValue('')
  expect(dialogs).toBe(1)
  await page.locator('#review-date').fill(initialDate)
  await page.locator('.reviews-table').getByRole('button', { name: 'Jun', exact: true }).click()
  await expect(page.locator('#student-name')).toHaveValue('Jun')
  expect(dialogs).toBe(1)
})

test('genre subtypes, new-pattern notes and empty observations remain readable', async ({ page }) => {
  await seed(page)
  const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
  await explorer.getByRole('combobox', { name: 'Explorer Problem Type' }).selectOption('unclassified')
  await expect(explorer.locator('.explorer-case-detail')).toContainText('Research Proposal Style · Prompt-Response / Q&A Style')
  await expect(explorer.locator('.explorer-case-detail')).toContainText('Repeated prompts.')
  await expect(explorer.locator('.explorer-case-detail')).toContainText('Preserve original notes.')
  await expect(explorer.getByRole('region', { name: 'Draft Patterns' })).toContainText('No structure items scored 0 or 1')
  await expect(explorer.getByRole('region', { name: 'Common Actions' })).toContainText('No rework selected')
  await explorer.getByText('About recorded values', { exact: true }).click()
  await expect(explorer.locator('.explorer-info')).toContainText('Older records without these fields')
})

for (const width of [2048, 1280, 900, 390]) {
  test(`Explorer layout and Chrome interaction fit ${width}px at 100% zoom`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()) })
    await page.setViewportSize({ width, height: width >= 1280 ? 1000 : 844 })
    await seed(page)
    await expect(page).toHaveTitle('SOP Score Tracker')
    const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
    await expect(explorer.getByRole('heading', { name: 'Pattern Explorer' })).toBeInViewport()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    for (const control of await explorer.getByRole('combobox').all()) {
      expect(await control.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14)
      expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    await explorer.getByRole('combobox', { name: 'Explorer MBTI' }).selectOption('xNFJ')
    await explorer.getByRole('combobox', { name: 'Explorer Problem Type' }).selectOption('type5')
    await expect(explorer.locator('.explorer-selection')).toContainText('2 reviews')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await explorer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const timeControls = page.getByRole('group', { name: 'Time Spent', exact: true })
    expect(await timeControls.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const button of await timeControls.getByRole('button').all()) {
      expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    const position = await page.evaluate(() => ({ form: document.querySelector('.form-panel')!.getBoundingClientRect().top, dashboard: document.querySelector('.dashboard-panel')!.getBoundingClientRect().top }))
    if (width <= 1100) {
      expect(position.dashboard).toBeLessThan(position.form)
      await explorer.getByRole('button', { name: 'Go to input ↓' }).click()
      await expect(page.locator('#student-name')).toBeFocused()
      await expect(page.locator('#student-name')).toBeInViewport()
      await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
      await expect(explorer.getByRole('heading', { name: 'Pattern Explorer' })).toBeInViewport()
    } else {
      expect(Math.abs(position.form - position.dashboard)).toBeLessThan(2)
    }
    if (process.env.EXPLORER_QA_DIR) await page.screenshot({ path: `${process.env.EXPLORER_QA_DIR}/explorer-${width}.png` })
    expect(errors).toEqual([])
  })
}
