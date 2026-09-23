import { expect, test } from '@playwright/test'

test('chosen defaults and review save persist after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#field')).toHaveValue('')
  await expect(page.locator('#field option')).toHaveText([
    'Select a field', 'Business / Management', 'Education', '공대·이공계',
    'Social Sciences', 'Sport', 'Development Studies', 'International Relations', 'Other',
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
