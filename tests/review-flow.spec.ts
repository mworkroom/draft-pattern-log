import { expect, test } from '@playwright/test'

test('chosen defaults and review save persist after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#field')).toHaveValue('')
  await expect(page.locator('#field option')).toHaveText([
    'Select a field', 'Business', 'STEM', 'Sport', 'Development Studies',
    'International Relations', 'Education', 'Social Sciences', 'UCAS', 'Foundation', 'Other',
  ])
  for (const [group, choice] of [
    ['Draft Language', 'English'], ['Level', "Master's"], ['School Tier', 'Mid'],
    ['AI Usage', 'Yes'], ['Time Spent', '60m'],
  ]) {
    await expect(page.getByRole('group', { name: group }).getByRole('button', { name: choice, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }

  await page.locator('#student-name').fill('QA Student')
  await page.locator('#field').selectOption('Development Studies')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '1' }).click()
  }
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('button', { name: 'QA Student', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Time Spent' }).getByRole('button', { name: '60m' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'QA Student', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /QA Student/ })).toContainText('Development Studies')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await page.getByRole('button', { name: 'Filters' }).click()
  const fieldFilter = page.locator('.filters-panel').getByRole('combobox', { name: 'Field' })
  await fieldFilter.selectOption('__missing')
  await expect(page.getByText('0 reviews in current filters')).toBeVisible()
  await fieldFilter.selectOption('Development Studies')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
})

test('revision focus saves independently and appears in filtered dashboard statistics', async ({ page }) => {
  await page.goto('./')
  const form = page.getByRole('region', { name: 'Review editor' })
  await expect(form.locator('.check-row span')).toHaveText([
    'Merge Paragraphs', 'Move Content', 'Compress Experience', 'Infer Hidden Logic',
  ])
  await expect(form.locator('.revision-table tbody th')).toHaveText([
    'Experience Closing', 'Academic Plan', 'Conclusion',
  ])
  await expect(form.getByRole('radio', { name: 'Academic Plan: none' })).toBeChecked()
  await form.getByRole('radio', { name: 'Academic Plan: rebuild' }).check()
  await form.getByRole('radio', { name: 'Conclusion: refine' }).check()
  await form.getByRole('radio', { name: 'Experience Closing: refine' }).check()
  await page.locator('#student-name').fill('QA Revision')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.locator('.chart-card').filter({ hasText: 'Academic Plan Rebuild Rate' })).toContainText('100%')
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const stats = page.locator('.revision-card')
  await expect(stats.locator('tbody th')).toHaveText(['Experience Closing', 'Academic Plan', 'Conclusion'])
  await expect(stats.getByRole('row', { name: /Academic Plan/ })).toContainText('1 (100%)')
  await expect(stats.getByRole('row', { name: /Conclusion/ })).toContainText('1 (100%)')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.locator('.filters-panel').getByRole('combobox', { name: 'Language' }).selectOption('Korean')
  await expect(stats).toContainText('No data in current filters')
  await expect(stats.getByRole('row', { name: /Academic Plan/ })).toContainText('—')
  await page.reload()
  await page.getByRole('button', { name: 'QA Revision', exact: true }).click()
  await expect(form.getByRole('radio', { name: 'Academic Plan: rebuild' })).toBeChecked()
  await expect(form.getByRole('radio', { name: 'Conclusion: refine' })).toBeChecked()
  await expect(page.locator('.type-choice input:checked')).toHaveCount(0)
  await expect(page.locator('.check-row input:checked')).toHaveCount(0)
})

test('legacy localStorage reviews without revision fields load as None', async ({ page }) => {
  await page.goto('./')
  await page.locator('#student-name').fill('QA Old Review')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await page.evaluate(() => {
    const key = 'sop-score-tracker:records:v1'
    const backup = JSON.parse(localStorage.getItem(key)!)
    delete backup.records[0].revision_academic_plan
    delete backup.records[0].revision_conclusion
    delete backup.records[0].revision_experience_closing
    backup.records[0].rework = ['rebuildAcademicPlan', 'rebuildConclusion', 'addMotivationBridge']
    localStorage.setItem(key, JSON.stringify(backup))
  })
  await page.reload()
  await expect(page.locator('.storage-alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'QA Old Review', exact: true }).click()
  await expect(page.locator('.footer-summary .summary-box.red')).toContainText('0 / 4')
  for (const area of ['Academic Plan', 'Conclusion', 'Experience Closing']) {
    await expect(page.getByRole('radio', { name: `${area}: none` })).toBeChecked()
  }
})

test('an old free-text Field stays visible until it is recategorized', async ({ page }) => {
  await page.goto('./')
  await page.locator('#student-name').fill('QA Legacy')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '1' }).click()
  }
  await page.getByRole('button', { name: 'Save Review' }).click()
  await page.evaluate(() => {
    const key = 'sop-score-tracker:records:v1'
    const backup = JSON.parse(localStorage.getItem(key)!)
    backup.records[0].field = 'Psychology'
    localStorage.setItem(key, JSON.stringify(backup))
  })
  await page.reload()
  await page.getByRole('button', { name: 'QA Legacy', exact: true }).click()
  await expect(page.locator('#field')).toHaveValue('Psychology')
  await expect(page.locator('#field option[value="Psychology"]')).toHaveText('Existing: Psychology')
  await page.locator('#field').selectOption('Social Sciences')
  await page.getByRole('button', { name: 'Update Review' }).click()
  await expect(page.getByRole('row', { name: /QA Legacy/ })).toContainText('Social Sciences')
})

test('problem type rules block an empty new-pattern note', async ({ page }) => {
  await page.goto('./')
  await page.locator('#student-name').fill('QA Pattern')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '2' }).click()
  }
  await page.locator('.type-choice').filter({ hasText: 'Type 1' }).click()
  await page.locator('.type-choice').filter({ hasText: 'Type 2' }).click()
  await expect(page.locator('.type-choice').filter({ hasText: 'Type 1' }).locator('input')).not.toBeChecked()
  await page.locator('.type-choice').filter({ hasText: 'Unclassified' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('alert')).toContainText('Unclassified')
  await page.locator('#pattern-note').fill('기존 유형으로 설명되지 않는 패턴')
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('button', { name: 'QA Pattern', exact: true })).toBeVisible()
})
