import { expect, test } from '@playwright/test'
import { blankDraft, STRUCTURE_KEYS, TYPE_KEYS, TYPE_LABELS, toRecord, type ReviewDraft, type TypeKey } from '../src/model'

const structure = Object.fromEntries(STRUCTURE_KEYS.map(key => [key, 1])) as ReviewDraft['structure']
const makeRecord = (studentName: string, problemTypes: TypeKey[], reviewDate = '2026-10-01') => toRecord({
  ...blankDraft(reviewDate), studentName, structure, problemTypes, field: 'Business',
  genreMismatchSubtypes: problemTypes.includes('type6') ? ['researchProposal'] : [],
  unclassifiedNote: problemTypes.includes('unclassified') ? 'A new pattern' : '',
})
const records = [
  ...TYPE_KEYS.map(key => ({
    ...makeRecord(`QA ${key}`, [key]),
    ...(key === 'type3' ? { level: 'Foundation', mbti: 'xNTP' } : {}),
  })),
  { ...makeRecord('QA combined types', ['type3', 'type5'], '2026-09-01'), level: 'UCAS', mbti: 'xNTJ' },
  makeRecord('QA no type', []),
]

for (const width of [1280, 2048]) {
  test(`Recent Reviews filters stay synchronized and readable at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1152 })
    const backup = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records })
    await page.addInitScript(value => localStorage.setItem('sop-score-tracker:records:v1', value), backup)
    await page.goto('./')
    await expect(page).toHaveTitle('SOP Score Tracker')
    await expect(page.getByRole('heading', { name: 'Recent Reviews' })).toBeVisible()
    const toolbar = page.locator('.recent-toolbar')
    const applicationFilter = toolbar.getByRole('combobox', { name: 'Application Type' })
    const typeFilter = toolbar.getByRole('combobox', { name: 'Problem Type' })
    const mbtiFilter = toolbar.getByRole('combobox', { name: 'MBTI' })
    const applicationChoices = ["Master's", "Bachelor's", 'UCAS', 'Foundation']
    const applicationButtons = page.getByRole('group', { name: 'Application Type' }).getByRole('button')
    await expect(applicationButtons).toHaveText(applicationChoices)
    await expect(toolbar.locator('.filter-select > span')).toHaveText(['Application Type', 'Problem Type', 'MBTI'])
    await expect(applicationFilter.locator('option')).toHaveText(['All', ...applicationChoices, 'Not specified'])
    const names = page.locator('.reviews-table .student-link')
    const total = page.locator('.kpi-card').filter({ hasText: 'Total Reviews' }).locator('strong')
    await expect(typeFilter.locator('option')).toHaveText(['All types', ...TYPE_KEYS.map(key => TYPE_LABELS[key])])
    await expect(names).toHaveCount(records.length)
    await expect(total).toHaveText(String(records.length))

    for (const key of TYPE_KEYS) {
      await typeFilter.selectOption(key)
      const expected = records.filter(record => record.problemTypes.includes(key)).map(record => record.studentName)
      await expect(names).toHaveText(expected)
      await expect(total).toHaveText(String(expected.length))
    }
    await typeFilter.selectOption('type5')
    await page.getByRole('button', { name: /^Filters/ }).click()
    const globalType = page.locator('.filters-panel').getByRole('combobox', { name: 'Problem Type' })
    await expect(globalType).toHaveValue('type5')
    await globalType.selectOption('type3')
    await expect(typeFilter).toHaveValue('type3')
    await expect(names).toHaveText(['QA type3', 'QA combined types'])
    const globalApplication = page.locator('.filters-panel').getByRole('combobox', { name: 'Application Type' })
    await applicationFilter.selectOption('UCAS')
    await expect(globalApplication).toHaveValue('UCAS')
    await expect(names).toHaveText(['QA combined types'])
    await globalApplication.selectOption('Foundation')
    await expect(applicationFilter).toHaveValue('Foundation')
    await expect(names).toHaveText(['QA type3'])
    await globalApplication.selectOption('')
    await page.getByRole('button', { name: /^Filters/ }).click()

    const search = page.getByRole('textbox', { name: 'Search recent reviews' })
    await applicationFilter.selectOption('UCAS')
    await mbtiFilter.selectOption('xNTP')
    await expect(names).toHaveCount(0)
    await mbtiFilter.selectOption('xNTJ')
    await search.fill('combined')
    await expect(names).toHaveText(['QA combined types'])
    await search.fill('type3')
    await expect(names).toHaveCount(0)
    await applicationFilter.selectOption('')
    await mbtiFilter.selectOption('')
    await search.fill('combined')
    await expect(page.locator('.overview-view .recent-filter-note')).toContainText('Showing 1 of 2 matching reviews')
    await search.fill('Business')
    await expect(names).toHaveCount(2)
    await search.fill('no match')
    await expect(page.locator('.overview-view .empty-table')).toHaveText('No reviews match the current filters or search.')
    await search.fill('')

    await page.getByRole('button', { name: /^Filters/ }).click()
    await page.locator('.filters-panel').getByRole('combobox', { name: 'Language' }).selectOption('Korean')
    await applicationFilter.selectOption('Foundation')
    await expect(page.locator('.overview-view .empty-table')).toBeVisible()
    await expect(total).toHaveText('0')
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(typeFilter).toHaveValue('')
    await expect(globalType).toHaveValue('')
    await expect(applicationFilter).toHaveValue('')
    await expect(globalApplication).toHaveValue('')
    await expect(total).toHaveText(String(records.length))
    await page.getByRole('button', { name: /^Filters/ }).click()
    await expect(names).toHaveCount(records.length)

    await typeFilter.selectOption('type5')
    await applicationFilter.selectOption('UCAS')
    await typeFilter.scrollIntoViewIfNeeded()
    await expect(typeFilter).toBeInViewport()
    await expect(search).toBeInViewport()
    for (const control of [applicationFilter, typeFilter, mbtiFilter, ...await toolbar.locator('.filter-select > span').all(), search, ...await applicationButtons.all()]) {
      expect(await control.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14)
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    expect(await toolbar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    const [selectBox, searchBox] = await Promise.all([typeFilter.boundingBox(), search.boundingBox()])
    expect(selectBox).not.toBeNull()
    expect(searchBox).not.toBeNull()
    expect(selectBox!.x + selectBox!.width <= searchBox!.x || selectBox!.y + selectBox!.height <= searchBox!.y).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem('sop-score-tracker:records:v1'))).toBe(backup)
    if (process.env.FILTER_QA_DIR) await page.screenshot({ path: `${process.env.FILTER_QA_DIR}/application-type-${width}.png` })
  })
}
