import { expect, test } from '@playwright/test'
import { blankDraft, MBTI_OPTIONS, STRUCTURE_KEYS, toRecord, type ReviewDraft } from '../src/model'

const structure = Object.fromEntries(STRUCTURE_KEYS.map(key => [key, 1])) as ReviewDraft['structure']
const legacyGroups = ['xNTJ', 'xNTP', 'xNFJ', 'xNFP', 'xSFJ', 'xSTJ', 'xSFP', 'xSTP']
const classified = legacyGroups.map(mbti => ({ ...toRecord({
  ...blankDraft(mbti === 'xNTJ' ? '2026-09-01' : '2026-10-08'), structure, narrativeSubtypes: ['delayedPointNarrative'],
  studentName: mbti === 'xNTJ' ? 'MBTI Repeat' : `MBTI ${mbti}`, problemTypes: ['type4'],
}), mbti }))
const repeat = { ...toRecord({ ...blankDraft('2026-10-08'), structure, studentName: 'MBTI Repeat', revisionRound: 2, problemTypes: ['type5'] }), mbti: 'xNTJ' }
const { mbti: _missing, ...legacy } = toRecord({ ...blankDraft('2026-10-08'), structure, studentName: 'MBTI Legacy' })

for (const width of [1280, 2048]) {
  test(`legacy MBTI groups load as I and manual E edits persist at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1152 })
    await page.goto('./')
    await expect(page).toHaveTitle('SOP Score Tracker')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    const input = page.locator('#mbti')
    await expect(input.locator('option')).toHaveText(['Not specified', ...MBTI_OPTIONS])
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    const distribution = page.getByRole('region', { name: 'MBTI Distribution', exact: true })
    await expect(distribution.locator('.mbti-stat')).toHaveCount(MBTI_OPTIONS.length)
    await expect(distribution.locator('.mbti-stat small')).toHaveText(Array(MBTI_OPTIONS.length).fill('0%'))
    await page.evaluate(value => localStorage.setItem('sop-score-tracker:records:v1', value), JSON.stringify({
      schemaVersion: 1, exportedAt: new Date().toISOString(), records: [...classified, repeat, legacy],
    }))
    await page.reload()
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
    const group = (key: string) => distribution.locator('.mbti-stat').filter({ has: page.getByText(key, { exact: true }) })
    await expect(distribution.locator('.card-head span')).toHaveText('9 classified reviews')
    await expect(group('INTJ').locator('span').first()).toHaveText('2 reviews')
    await expect(group('INTJ').locator('small')).toHaveText('22.2%')
    await expect(distribution.getByRole('progressbar', { name: 'INTJ', exact: true })).toHaveAttribute('aria-valuenow', '2')
    for (const key of MBTI_OPTIONS.slice(1)) await expect(group(key).locator('small')).toHaveText(key.startsWith('E') ? '0%' : '11.1%')
    const mbtiFilter = explorer.getByRole('combobox', { name: 'Explorer MBTI' })
    const typeFilter = explorer.getByRole('combobox', { name: 'Explorer Problem Type' })
    await mbtiFilter.selectOption('INTJ')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveText(['MBTI Repeat', 'MBTI Repeat'])
    await expect(group('INTJ').locator('small')).toHaveText('100%')
    await typeFilter.selectOption('type5')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(1)
    await explorer.locator('.matching-reviews-table .student-link').click()
    await expect(input).toBeDisabled()
    await expect(input).toHaveValue('INTJ')
    await page.getByRole('button', { name: 'Edit Review', exact: true }).click()
    await input.selectOption('ENTJ')
    await expect(page.getByRole('button', { name: 'Update Review', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: 'Update Review', exact: true }).click()
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(0)
    await explorer.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(group('INTJ').locator('span').first()).toHaveText('1 review')
    await expect(group('ENTJ').locator('small')).toHaveText('11.1%')
    await page.reload()
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    await mbtiFilter.selectOption('ENTJ')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(1)
    const repeatRow = explorer.locator('.matching-reviews-table tbody tr').filter({ hasText: 'MBTI Repeat' })
    await repeatRow.getByRole('button', { name: 'MBTI Repeat', exact: true }).click()
    await expect(input).toHaveValue('ENTJ')
    await page.getByRole('button', { name: 'Edit Review', exact: true }).click()
    await input.selectOption('')
    await page.getByRole('button', { name: 'Update Review', exact: true }).click()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records)
    expect(stored.find((record: { id: string }) => record.id === repeat.id).mbti).toBe('')
    expect(stored.find((record: { studentName: string }) => record.studentName === 'MBTI Legacy').mbti).toBe('')
    await explorer.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(distribution.locator('.card-head span')).toHaveText('8 classified reviews')
    expect(await distribution.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await distribution.locator('.mbti-stat').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
