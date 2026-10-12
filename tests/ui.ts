import type { Page } from '@playwright/test'

export async function showStatistics(page: Page, tab: string) {
  await page.getByRole('button', { name: 'Statistics', exact: true }).click()
  await page.getByRole('tab', { name: tab, exact: true }).click()
}

export async function editSelectedReview(page: Page) {
  await page.getByRole('button', { name: 'Edit Review', exact: true }).click()
}
