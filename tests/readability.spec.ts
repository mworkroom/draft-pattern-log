import { expect, test } from '@playwright/test'

for (const width of [1280, 2048]) {
  test(`readable typography fits a ${width}px desktop viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1000 })
    await page.goto('./')

    for (const selector of [
      '.field-block > label',
      '.field-block > input',
      '.field-block > select',
      '.segmented button',
      '.score-row label',
      '.check-row',
      '.kpi-label',
      '.chart-title',
      '.revision-table th',
    ]) {
      const fontSize = await page.locator(selector).first().evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).fontSize),
      )
      expect(fontSize, `${selector} should be readable at ${width}px`).toBeGreaterThanOrEqual(14)
    }

    await expect(page.getByRole('button', { name: 'Save Review' })).toBeInViewport()
    expect(await page.locator('.revision-table-wrap').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.getByRole('tab', { name: 'Problem patterns' }).click()
    const statsFontSize = await page.locator('.revision-stats-table td').first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(statsFontSize).toBeGreaterThanOrEqual(14)
    expect(await page.locator('.revision-stats-wrap').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(pageWidth).toBeLessThanOrEqual(width)
  })
}
