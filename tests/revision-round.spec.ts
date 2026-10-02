import { expect, test } from '@playwright/test'
import { blankDraft, STRUCTURE_KEYS, toRecord, type ReviewDraft } from '../src/model'

const structure = Object.fromEntries(STRUCTURE_KEYS.map(key => [key, 1])) as ReviewDraft['structure']
const records = ([1, 2, 3] as const).map(revisionRound => toRecord({
  ...blankDraft('2026-10-03'), studentName: '정유진', structure, revisionRound,
  problemTypes: revisionRound === 3 ? ['type4', 'unclassified'] : ['type4'],
  unclassifiedNote: revisionRound === 3 ? '차수별 새 패턴' : '',
}))
const { revisionRound: _legacyRound, ...legacy } = records[0]

for (const width of [1280, 2048]) {
  test(`rounds preserve names and Type 4, badges and statistics at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1152 })
    await page.goto('./')
    await expect(page).toHaveTitle('SOP Score Tracker')
    const roundControl = page.getByRole('group', { name: 'Revision Round', exact: true })
    await expect(roundControl.getByRole('button')).toHaveText(['1', '2', '3'])
    await expect(roundControl.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const roundLayout = await roundControl.evaluate(element => ({
      font: Number.parseFloat(getComputedStyle(element.querySelector('button')!).fontSize),
      fits: element.scrollWidth <= element.clientWidth,
    }))
    expect(roundLayout.font).toBeGreaterThanOrEqual(14)
    expect(roundLayout.fits).toBe(true)
    await expect(page.getByRole('button', { name: 'Save Review', exact: true })).toBeInViewport()
    await page.evaluate(value => localStorage.setItem('sop-score-tracker:records:v1', value), JSON.stringify({
      schemaVersion: 1, exportedAt: new Date().toISOString(), records: [legacy, ...records.slice(1)],
    }))
    await page.reload()
    await expect(page.locator('.storage-alert')).toHaveCount(0)
    await expect(page.locator('.reviews-table .student-link')).toHaveText(['정유진', '정유진', '정유진'])
    const table = page.locator('.reviews-table')
    await expect(table.locator('.revision-round-badge')).toHaveCount(2)
    await expect(table.getByText('2차', { exact: true })).toHaveCount(1)
    await expect(table.getByText('3차', { exact: true })).toHaveCount(1)
    await expect(page.getByText('1차', { exact: true })).toHaveCount(0)
    const firstRound = table.locator('tbody tr').filter({ hasNot: page.locator('.revision-round-badge') })
    await firstRound.getByRole('button', { name: '정유진', exact: true }).click()
    await expect(roundControl.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const type4 = page.locator('.type-choice').filter({ hasText: 'Type 4 — Narrative / Indirect' })
    await expect(type4.locator('input')).toBeChecked()
    await expect(type4.locator('small')).toHaveText('핵심 의미를 늦추거나 숨기고, 극적 효과를 위해 우회적으로 서술')
    expect(await type4.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.getByRole('tab', { name: 'Problem patterns' }).click()
    await expect(page.locator('.pattern-record .revision-round-badge')).toHaveText('3차')
    const distribution = page.locator('.analysis-card').filter({ hasText: 'Problem Type Distribution' })
    const type4Count = distribution.locator('.progress-row').filter({ hasText: 'Type 4 — Narrative / Indirect' }).locator('strong')
    await expect(type4Count).toHaveText('3')
    await page.locator('.filter-button').click()
    const roundFilter = page.locator('.filters-panel').getByRole('combobox', { name: 'Revision Round', exact: true })
    await expect(roundFilter.locator('option')).toHaveText(['All', '1', '2', '3'])
    const total = page.locator('.kpi-card').filter({ hasText: 'Total Reviews' }).locator('strong')
    for (const round of ['1', '2', '3']) {
      await roundFilter.selectOption(round)
      await expect(total).toHaveText('1')
      await expect(type4Count).toHaveText('1')
      await expect(table.locator('.revision-round-badge')).toHaveCount(round === '1' ? 0 : 1)
    }
    await table.getByRole('button', { name: '정유진', exact: true }).click()
    await expect(roundControl.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await roundControl.getByRole('button', { name: '2', exact: true }).click()
    await expect(type4.locator('input')).toBeChecked()
    await page.getByRole('button', { name: 'Update Review', exact: true }).click()
    await expect(total).toHaveText('0')
    await roundFilter.selectOption('2')
    await expect(total).toHaveText('2')
    await expect(type4Count).toHaveText('2')
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await expect(total).toHaveText('3')
    await page.reload()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records)
    expect(saved.map((record: { studentName: string }) => record.studentName)).toEqual(['정유진', '정유진', '정유진'])
    expect(saved.map((record: { revisionRound: number }) => record.revisionRound)).toEqual([1, 2, 2])
    await expect(table.locator('.revision-round-badge')).toHaveText(['2차', '2차'])
    expect(await table.locator('.revision-round-badge').first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
