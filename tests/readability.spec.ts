import { expect, test } from '@playwright/test'

for (const width of [1280, 2048]) {
  test(`readable typography fits a ${width}px desktop viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1000 })
    await page.goto('./')

    for (const selector of [
      '.field-block > label',
      '.field-block > input',
      '.segmented button',
      '.score-row label',
      '.check-row',
      '.kpi-label',
      '.chart-title',
    ]) {
      const fontSize = await page.locator(selector).first().evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).fontSize),
      )
      expect(fontSize, `${selector} should be readable at ${width}px`).toBeGreaterThanOrEqual(14)
    }

    await expect(page.getByRole('button', { name: 'Save Review' })).toBeInViewport()
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(pageWidth).toBeLessThanOrEqual(width)
  })
}
