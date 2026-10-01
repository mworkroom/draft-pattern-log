import { expect, test } from '@playwright/test'

test('chosen defaults and review save persist after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#field')).toHaveValue('')
  await expect(page.locator('#field option')).toHaveText([
    'Select a field', 'Business', 'STEM', 'Sport', 'Development Studies',
    'International Relations', 'Public Policy', 'Helping Professions', 'Social Sciences', 'UCAS', 'Foundation', 'Other',
  ])
  await expect(page.locator('#background option')).toHaveText([
    'Not specified', 'Corporate', 'Fresh Graduate', 'Public Sector',
    'NGO', 'Other',
  ])
  await expect(page.locator('#background')).toHaveValue('')
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
    'Merge Paragraphs', 'Move Content', 'Compress Experience', 'Infer Hidden Logic', 'Develop Missing Examples',
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
    delete backup.records[0].background
    backup.records[0].rework = ['rebuildAcademicPlan', 'rebuildConclusion', 'addMotivationBridge']
    localStorage.setItem(key, JSON.stringify(backup))
  })
  await page.reload()
  await expect(page.locator('.storage-alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'QA Old Review', exact: true }).click()
  await expect(page.locator('#background')).toHaveValue('')
  await expect(page.locator('.footer-summary .summary-box.red')).toContainText('0 / 5')
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

test('missing-example rework saves, restores, and appears in dashboard trends', async ({ page }) => {
  await page.goto('./')
  await page.locator('#student-name').fill('QA Missing Examples')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.locator('.check-row').filter({ hasText: 'Develop Missing Examples' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('row', { name: /QA Missing Examples/ })).toContainText('1 / 5')
  await page.reload()
  await page.getByRole('button', { name: 'QA Missing Examples', exact: true }).click()
  await expect(page.locator('.check-row').filter({ hasText: 'Develop Missing Examples' }).locator('input')).toBeChecked()
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const trends = page.locator('.analysis-card').filter({ hasText: 'Major Rework Trends' })
  await expect(trends.locator('.progress-row').filter({ hasText: 'Develop Missing Examples' }).locator('strong')).toHaveText('1')
})

test('Type 5 shares the existing card flow and appears in filtered distribution after reload', async ({ page }) => {
  await page.goto('./')
  const form = page.getByRole('region', { name: 'Review editor' })
  await expect(form.locator('.type-choice strong')).toHaveText([
    'Type 1 — Length + Structure', 'Type 2 — Structure', 'Type 3 — Experience / Plan',
    'Type 4 — Delayed-point', 'Type 5 — Career-summary / CV-style', 'Type 6 — Genre Mismatch',
    'Type 7 · Weak English Writing', 'Unclassified / New Pattern',
  ])
  const careerType = form.locator('.type-choice').filter({ hasText: 'Type 5 — Career-summary / CV-style' })
  await expect(careerType.locator('small')).toHaveText('경력 전체를 CV처럼 요약해 구체적 사례와 학업 동기가 드러나지 않음')
  await page.locator('#student-name').fill('QA Career Summary')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await form.locator('.type-choice').filter({ hasText: 'Type 3' }).click()
  await careerType.click()
  await expect(form.locator('.type-choice input:checked')).toHaveCount(2)
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('row', { name: /QA Career Summary/ })).toContainText('T3, T5')
  await page.reload()
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const distribution = page.locator('.analysis-card').filter({ hasText: 'Problem Type Distribution' })
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 5 — Career-summary / CV-style' }).locator('strong')).toHaveText('1')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.locator('.filters-panel').getByRole('combobox', { name: 'Problem Type' }).selectOption('type5')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 5 — Career-summary / CV-style' }).locator('strong')).toHaveText('1')
  await page.getByRole('button', { name: 'QA Career Summary', exact: true }).click()
  await expect(form.locator('.type-choice').filter({ hasText: 'Type 3' }).locator('input')).toBeChecked()
  await expect(careerType.locator('input')).toBeChecked()
})

test('Type 6 requires a selected genre, coexists with Type 2, and restores both subtypes', async ({ page }) => {
  await page.goto('./')
  const form = page.getByRole('region', { name: 'Review editor' })
  await page.locator('#student-name').fill('QA Genre Mismatch')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '2' }).click()
  await form.locator('.type-choice').filter({ hasText: 'Type 2 — Structure' }).click()
  const type6 = form.locator('.type-choice').filter({ hasText: 'Type 6 — Genre Mismatch' })
  await type6.click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('alert')).toContainText('Type 6')
  const subtypes = form.getByRole('group', { name: 'Type 6 subtypes' })
  await expect(subtypes.locator('.type-choice strong')).toHaveText(['Research Proposal Style', 'Prompt-Response / Q&A Style'])
  await subtypes.locator('.type-choice').filter({ hasText: 'Research Proposal Style' }).click()
  await subtypes.locator('.type-choice').filter({ hasText: 'Prompt-Response / Q&A Style' }).click()
  await expect(subtypes.locator('input:checked')).toHaveCount(2)
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('row', { name: /QA Genre Mismatch/ })).toContainText('T2, T6')
  await page.reload()
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const distribution = page.locator('.analysis-card').filter({ hasText: 'Problem Type Distribution' })
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 6 — Genre Mismatch' }).locator('strong')).toHaveText('1')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.locator('.filters-panel').getByRole('combobox', { name: 'Problem Type' }).selectOption('type6')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await page.getByRole('button', { name: 'QA Genre Mismatch', exact: true }).click()
  await expect(subtypes.locator('input:checked')).toHaveCount(2)
  await type6.click()
  await expect(subtypes).toHaveCount(0)
  await page.getByRole('button', { name: 'Update Review' }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records[0].genreMismatchSubtypes)).toEqual([])
})

test('Type 7 saves with another problem type and appears in filtered distribution', async ({ page }) => {
  await page.goto('./')
  const form = page.getByRole('region', { name: 'Review editor' })
  const type7 = form.locator('.type-choice').filter({ hasText: 'Type 7 · Weak English Writing' })
  await expect(type7.locator('small')).toHaveText('영어 표현력이 부족한 상태에서 직접 영작하거나 AI/번역 결과를 수정하여 문법, 표현, 의미 전달이 크게 저하된 경우')
  await page.locator('#student-name').fill('QA Weak English')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '2' }).click()
  await form.locator('.type-choice').filter({ hasText: 'Type 1 — Length + Structure' }).click()
  await type7.click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.getByRole('row', { name: /QA Weak English/ })).toContainText('T1, T7')
  await page.reload()
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const distribution = page.locator('.analysis-card').filter({ hasText: 'Problem Type Distribution' })
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 7 · Weak English Writing' }).locator('strong')).toHaveText('1')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.locator('.filters-panel').getByRole('combobox', { name: 'Problem Type' }).selectOption('type7')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await page.getByRole('button', { name: 'QA Weak English', exact: true }).click()
  await expect(form.locator('.type-choice').filter({ hasText: 'Type 1 — Length + Structure' }).locator('input')).toBeChecked()
  await expect(type7.locator('input')).toBeChecked()
})

test('Background saves separately from Field and filters existing dashboard statistics', async ({ page }) => {
  await page.goto('./')
  await page.locator('#student-name').fill('QA Public Sector')
  await page.locator('#field').selectOption('Development Studies')
  await page.locator('#background').selectOption('Public Sector')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.locator('.type-choice').filter({ hasText: 'Type 5' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('sop-score-tracker:records:v1')!).records[0].background))
    .toBe('Public Sector')

  await page.locator('#student-name').fill('QA No Background')
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'QA Public Sector', exact: true }).click()
  await expect(page.locator('#field')).toHaveValue('Development Studies')
  await expect(page.locator('#background')).toHaveValue('Public Sector')
  await page.locator('#background').selectOption('Corporate')
  await page.getByRole('button', { name: 'Update Review' }).click()
  await page.getByRole('tab', { name: 'Problem patterns' }).click()
  const distribution = page.locator('.analysis-card').filter({ hasText: 'Problem Type Distribution' })
  await page.getByRole('button', { name: 'Filters' }).click()
  const backgroundFilter = page.locator('.filters-panel').getByRole('combobox', { name: 'Background' })
  await expect(backgroundFilter.locator('option')).toHaveText([
    'All', 'Corporate', 'Fresh Graduate', 'Public Sector', 'NGO',
    'Other', 'Not specified',
  ])
  await backgroundFilter.selectOption('Corporate')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 5' }).locator('strong')).toHaveText('1')
  await backgroundFilter.selectOption('__missing')
  await expect(page.getByText('1 review in current filters')).toBeVisible()
  await expect(distribution.locator('.progress-row').filter({ hasText: 'Type 5' }).locator('strong')).toHaveText('0')
  await expect(page.getByRole('row', { name: /QA No Background/ })).toBeVisible()
})
