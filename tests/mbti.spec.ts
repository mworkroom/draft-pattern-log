import { expect, test } from '@playwright/test'
import { blankDraft, MBTI_OPTIONS, STRUCTURE_KEYS, toRecord, type ReviewDraft } from '../src/model'

const structure = Object.fromEntries(STRUCTURE_KEYS.map(key => [key, 1])) as ReviewDraft['structure']
const classified = MBTI_OPTIONS.map(mbti => toRecord({
  ...blankDraft(mbti === 'xNTJ' ? '2026-09-01' : '2026-10-08'), structure, mbti,
  studentName: mbti === 'xNTJ' ? 'MBTI Repeat' : `MBTI ${mbti}`, problemTypes: ['type4'],
}))
const repeat = toRecord({ ...blankDraft('2026-10-08'), structure, studentName: 'MBTI Repeat', revisionRound: 2, mbti: 'xNTJ', problemTypes: ['type5'] })
const { mbti: _missing, ...legacy } = toRecord({ ...blankDraft('2026-10-08'), structure, studentName: 'MBTI Legacy' })

for (const width of [1280, 2048]) {
  test(`MBTI bars use classified reviews and edits persist at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1152 })
    await page.goto('./')
    const input = page.locator('#mbti')
    await expect(input.locator('option')).toHaveText(['Not specified', ...MBTI_OPTIONS])
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    const distribution = page.getByRole('region', { name: 'MBTI Distribution', exact: true })
    await expect(distribution.locator('.mbti-stat')).toHaveCount(8)
    await expect(distribution.locator('.mbti-stat small')).toHaveText(Array(8).fill('0%'))
    await page.evaluate(value => localStorage.setItem('sop-score-tracker:records:v1', value), JSON.stringify({
      schemaVersion: 1, exportedAt: new Date().toISOString(), records: [...classified, repeat, legacy],
    }))
    await page.reload()
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    const explorer = page.getByRole('region', { name: 'Pattern Explorer', exact: true })
    const group = (key: string) => distribution.locator('.mbti-stat').filter({ has: page.getByText(key, { exact: true }) })
    await expect(distribution.locator('.card-head span')).toHaveText('9 classified reviews')
    await expect(group('xNTJ').locator('span').first()).toHaveText('2 reviews')
    await expect(group('xNTJ').locator('small')).toHaveText('22.2%')
    await expect(distribution.getByRole('progressbar', { name: 'xNTJ', exact: true })).toHaveAttribute('aria-valuenow', '2')
    for (const key of MBTI_OPTIONS.slice(1)) await expect(group(key).locator('small')).toHaveText('11.1%')
    const mbtiFilter = explorer.getByRole('combobox', { name: 'Explorer MBTI' })
    const typeFilter = explorer.getByRole('combobox', { name: 'Explorer Problem Type' })
    await mbtiFilter.selectOption('xNTJ')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveText(['MBTI Repeat', 'MBTI Repeat'])
    await expect(group('xNTJ').locator('small')).toHaveText('100%')
    await typeFilter.selectOption('type5')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(1)
    await explorer.locator('.matching-reviews-table .student-link').click()
    await expect(input).toBeDisabled()
    await page.getByRole('button', { name: 'Edit Review', exact: true }).click()
    await input.selectOption('xSFP')
    await page.getByRole('button', { name: 'Update Review', exact: true }).click()
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(0)
    await explorer.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(group('xSFP').locator('span').first()).toHaveText('2 reviews')
    await expect(group('xSFP').locator('small')).toHaveText('22.2%')
    await page.reload()
    await page.getByRole('button', { name: 'Pattern Explorer', exact: true }).click()
    await mbtiFilter.selectOption('xSFP')
    await expect(explorer.locator('.matching-reviews-table .student-link')).toHaveCount(2)
    const repeatRow = explorer.locator('.matching-reviews-table tbody tr').filter({ hasText: 'MBTI Repeat' })
    await repeatRow.getByRole('button', { name: 'MBTI Repeat', exact: true }).click()
    await expect(input).toHaveValue('xSFP')
    await page.getByRole('button', { name: 'Edit Review', exact: true }).click()
    await input.selectOption('')
    await page.getByRole('button', { name: 'Update Review', exact: true }).click()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records)
    expect(stored.find((record: { id: string }) => record.id === repeat.id).mbti).toBe('')
    expect(stored.find((record: { studentName: string }) => record.studentName === 'MBTI Legacy').mbti).toBe('')
    await explorer.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(distribution.locator('.card-head span')).toHaveText('8 classified reviews')
    expect(await distribution.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
