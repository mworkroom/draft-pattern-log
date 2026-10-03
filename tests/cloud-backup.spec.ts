import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const url = 'https://ddlwainwollvpaeccpty.supabase.co'
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'qa@example.test', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-03T00:00:00Z' }
type Snapshot = { id: string; created_at: string; record_count: number; backup: { schemaVersion: number; exportedAt: string; records: Record<string, unknown>[] } }

async function mockCloud(page: Page) {
  let head: Snapshot | null = null
  let offline = false
  const versions: Snapshot[] = []
  await page.addInitScript(({ user }) => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const access = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }) + '.test'
    localStorage.setItem('draft-pattern-log:auth:v1', JSON.stringify({ access_token: access, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }))
  }, { user })
  await page.route(url + '/**', async route => {
    const request = route.request()
    const parsed = new URL(request.url())
    if (parsed.pathname.includes('/auth/v1/')) {
      await route.fulfill({ json: user }); return
    }
    if (offline) { await route.fulfill({ status: 503, json: { message: 'QA offline' } }); return }
    if (parsed.pathname.endsWith('/rpc/draft_pattern_save_backup')) {
      const body = request.postDataJSON()
      const existing = versions.find(item => item.id === body.p_request_id)
      if (existing) { await route.fulfill({ json: [existing] }); return }
      if ((head?.id ?? null) !== body.p_expected_id) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'DRAFT_BACKUP_CONFLICT' } }); return
      }
      head = { id: body.p_request_id, created_at: new Date(Date.now() + versions.length).toISOString(), record_count: body.p_backup.records.length, backup: body.p_backup }
      versions.push(head)
      await route.fulfill({ json: [head] }); return
    }
    if (parsed.pathname.endsWith('/draft_pattern_backup_heads')) {
      await route.fulfill({ json: head ? [{ snapshot: head }] : [] }); return
    }
    if (parsed.pathname.endsWith('/draft_pattern_backup_snapshots')) {
      const id = parsed.searchParams.get('id')?.replace('eq.', '')
      if (id) { await route.fulfill({ json: versions.find(item => item.id === id) }); return }
      await route.fulfill({ json: [...versions].reverse().map(({ id, created_at, record_count }) => ({ id, created_at, record_count })) }); return
    }
    throw new Error('Unexpected mocked endpoint: ' + request.url())
  })
  return { versions, offline: (value: boolean) => { offline = value } }
}

async function save(page: Page, name: string) {
  await page.locator('#student-name').fill(name)
  for (const row of await page.locator('.score-row').all()) await row.getByRole('button', { name: '1' }).click()
  await page.getByRole('button', { name: 'Save Review' }).click()
}

test('cloud backup preserves offline revisions, survives reload and restores history', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const cloud = await mockCloud(page)
  await page.goto('./')
  const panel = page.getByRole('button', { name: '클라우드 백업', exact: true })
  await expect(panel).toHaveAttribute('title', /클라우드 연결됨/)
  await save(page, 'Cloud QA One')
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  expect(cloud.versions).toHaveLength(1)
  cloud.offline(true)
  await save(page, 'Cloud QA Two')
  await expect(panel).toHaveAttribute('title', /클라우드 백업 실패/)
  expect(await page.getByRole('button', { name: 'Cloud QA Two', exact: true }).count()).toBe(1)
  cloud.offline(false)
  await page.reload()
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 2건/)
  expect(cloud.versions).toHaveLength(2)
  await panel.click()
  const details = page.getByRole('dialog', { name: '클라우드 백업', exact: true })
  const options = page.locator('#cloud-version option')
  await expect(options).toHaveCount(2)
  await page.locator('#cloud-version').selectOption(cloud.versions[0].id)
  page.once('dialog', dialog => dialog.accept())
  await details.getByRole('button', { name: '선택 버전 복구' }).click()
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  await expect(page.getByRole('button', { name: 'Cloud QA Two', exact: true })).toHaveCount(0)
  expect(cloud.versions).toHaveLength(3)
  expect(cloud.versions[1].record_count).toBe(2)
  expect(errors).toEqual([])
})

test('lost browser data cannot erase cloud records and can be recovered', async ({ page }) => {
  const cloud = await mockCloud(page)
  await page.goto('./')
  const panel = page.getByRole('button', { name: '클라우드 백업', exact: true })
  await expect(panel).toHaveAttribute('title', /클라우드 연결됨/)
  await save(page, 'Recovery QA')
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(panel).toHaveAttribute('title', /클라우드 1건과 로컬 0건이 다릅니다/)
  await panel.click()
  const details = page.getByRole('dialog', { name: '클라우드 백업', exact: true })
  expect(cloud.versions).toHaveLength(1)
  await expect(details.getByRole('button', { name: '현재 기록을 클라우드에 백업' })).toHaveCount(0)
  page.once('dialog', dialog => dialog.accept())
  await details.getByRole('button', { name: '클라우드에서 복구', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recovery QA', exact: true })).toBeVisible()
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  expect(cloud.versions).toHaveLength(1)
})

test('corrupted local records can be recovered without uploading an empty backup', async ({ page }) => {
  const cloud = await mockCloud(page)
  await page.goto('./')
  const panel = page.getByRole('button', { name: '클라우드 백업', exact: true })
  await expect(panel).toHaveAttribute('title', /클라우드 연결됨/)
  await save(page, 'Corruption Recovery QA')
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  await page.evaluate(() => {
    localStorage.setItem('sop-score-tracker:records:v1', '{broken')
  })
  await page.reload()
  await expect(page.locator('.storage-alert')).toContainText('저장된 데이터가 손상')
  await expect(panel).toHaveAttribute('title', /클라우드 1건과 로컬 0건이 다릅니다/)
  await panel.click()
  const details = page.getByRole('dialog', { name: '클라우드 백업', exact: true })
  page.once('dialog', dialog => dialog.accept())
  await details.getByRole('button', { name: '클라우드에서 복구', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Corruption Recovery QA', exact: true })).toBeVisible()
  await expect(page.locator('.storage-alert')).toHaveCount(0)
  await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  expect(cloud.versions).toHaveLength(1)
})

for (const width of [1280, 2048]) {
  test(`cloud controls fit Chrome at ${width}px without reducing text size`, async ({ page }) => {
    await mockCloud(page)
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1152 })
    const errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('./')
    await expect(page).toHaveTitle('SOP Score Tracker')
    const panel = page.getByRole('button', { name: '클라우드 백업', exact: true })
    await expect(panel).toHaveAttribute('title', /클라우드 연결됨/)
    await save(page, 'Viewport QA')
    await expect(panel).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
    await expect(page.locator('.backup-strip')).toHaveCount(0)
    await expect(page.getByText(user.email, { exact: false })).toHaveCount(0)
    expect(await page.locator('.workspace').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(90)
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeInViewport()
    await page.screenshot({ path: `C:/Users/Marion/.codex/visualizations/2026/10/02/01a0fe7c-ec8f-7e80-8d43-812f47c96513/compact-header-${width}.png` })
    await panel.click()
    await expect(page.locator('#cloud-version')).toBeVisible()
    for (const selector of ['.cloud-detail-status', '.dialog-body .tool-button', '.cloud-history select']) {
      expect(await page.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `C:/Users/Marion/.codex/visualizations/2026/10/02/01a0fe7c-ec8f-7e80-8d43-812f47c96513/compact-history-${width}.png` })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Save Review' })).toBeInViewport()
    expect(await page.locator('vite-error-overlay').count()).toBe(0)
    await page.getByRole('button', { name: '설정', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '설정', exact: true })
    await expect(settings.getByText(user.email, { exact: false })).toBeVisible()
    await expect(settings.getByRole('region', { name: 'JSON 백업', exact: true })).toBeVisible()
    await expect(settings.getByRole('button', { name: '연결 해제', exact: true })).toBeVisible()
    expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: `C:/Users/Marion/.codex/visualizations/2026/10/02/01a0fe7c-ec8f-7e80-8d43-812f47c96513/compact-settings-${width}.png` })
    await settings.getByRole('button', { name: '닫기', exact: true }).click()
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeFocused()
    // Opening settings does not restart the coordinator or reset the review draft.
    await page.locator('#student-name').fill('Unsaved draft')
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('#student-name')).toHaveValue('Unsaved draft')
    expect(errors).toEqual([])
  })
}

test('JSON export and account controls live in settings and preserve the review draft', async ({ page }) => {
  await mockCloud(page)
  await page.goto('./')
  const header = page.getByRole('button', { name: '클라우드 백업', exact: true })
  await expect(header).toHaveAttribute('title', /클라우드 연결됨/)
  await save(page, 'Settings QA')
  await expect(header).toHaveAttribute('title', /클라우드 백업 완료 · 1건/)
  await page.locator('#student-name').fill('Keep this draft')
  await expect(page.getByRole('button', { name: 'Backup', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '연결 해제', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '설정', exact: true })
  const downloaded = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Backup', exact: true }).click()
  const file = await downloaded
  const backup = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(backup.records.map((record: { studentName: string }) => record.studentName)).toEqual(['Settings QA'])
  await expect(settings).toContainText('최근 JSON 백업')
  await settings.getByRole('button', { name: '연결 해제', exact: true }).click()
  await expect(settings.getByRole('button', { name: 'Google로 연결', exact: true })).toBeVisible()
  await expect(settings.getByText(user.email, { exact: false })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(header).toContainText('클라우드 미연결')
  await expect(page.getByRole('button', { name: 'Google로 연결', exact: true })).toHaveCount(0)
  await expect(page.locator('#student-name')).toHaveValue('Keep this draft')
})
