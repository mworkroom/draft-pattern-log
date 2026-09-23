import { expect, test } from '@playwright/test'

test('folder backup survives lost browser data and never overwrites the existing file', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    // OPFS supplies a writable test folder, but is not a picked OS folder.
    // Simulate loss of the remembered handle while retaining its JSON file.
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      return originalPut.call(this, value instanceof FileSystemDirectoryHandle ? null : value, key)
    }
    const directoryPrototype = FileSystemDirectoryHandle.prototype as FileSystemDirectoryHandle & {
      queryPermission?: () => Promise<string>
      requestPermission?: () => Promise<string>
    }
    directoryPrototype.queryPermission = async () => 'granted'
    directoryPrototype.requestPermission = async () => 'granted'
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: async () => {
        const root = await navigator.storage.getDirectory()
        return root.getDirectoryHandle('EDM', { create: true })
      },
    })
  })

  await page.goto('./')
  await expect(page.locator('.backup-strip')).toContainText('처음 한 번')
  await page.getByRole('button', { name: '백업 폴더 선택' }).click()
  await expect(page.locator('.backup-strip')).toContainText('EDM 폴더 연결됨')

  await page.locator('#student-name').fill('Backup QA Student')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '1' }).click()
  }
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.locator('.backup-strip')).toContainText('자동 백업 완료')
  const readFile = () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('EDM')
    const file = await directory.getFileHandle('sop-score-tracker-current.json')
    return JSON.parse(await (await file.getFile()).text()) as { records: { studentName: string }[] }
  })
  expect((await readFile()).records[0].studentName).toBe('Backup QA Student')

  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('sop-score-tracker:file-backup:v1')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  })
  await page.reload()
  await expect(page.locator('.backup-strip')).toContainText('처음 한 번')
  await page.getByRole('button', { name: '백업 폴더 선택' }).click()
  await expect(page.locator('.backup-strip.conflict')).toContainText('폴더 백업 1건과 브라우저 기록 0건')
  await expect(page.getByRole('button', { name: '현재 기록을 폴더에 저장' })).toHaveCount(0)
  expect((await readFile()).records).toHaveLength(1)

  await page.getByRole('button', { name: '폴더 파일에서 복구' }).click()
  await expect(page.getByRole('button', { name: 'Backup QA Student', exact: true })).toBeVisible()
  await expect(page.locator('.backup-strip.ready')).toContainText('자동 백업이 연결됐습니다')

  await page.locator('#student-name').fill('Second QA Student')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '1' }).click()
  }
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.locator('.backup-strip.ready')).toContainText('자동 백업 완료')
  expect((await readFile()).records).toHaveLength(2)
  const historyCount = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('EDM')
    const date = new Date()
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
    const file = await directory.getFileHandle(`sop-score-tracker-history-${stamp}.json`)
    return (JSON.parse(await (await file.getFile()).text()) as { records: unknown[] }).records.length
  })
  expect(historyCount).toBe(1)

  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('EDM')
    const file = await directory.getFileHandle('sop-score-tracker-current.json')
    const snapshot = JSON.parse(await (await file.getFile()).text()) as { records: { studentName: string }[] }
    snapshot.records[0].studentName = 'Changed outside app'
    const writable = await file.createWritable()
    await writable.write(JSON.stringify(snapshot))
    await writable.close()
  })
  await page.locator('#student-name').fill('Third QA Student')
  for (const row of await page.locator('.score-row').all()) {
    await row.getByRole('button', { name: '1' }).click()
  }
  await page.getByRole('button', { name: 'Save Review' }).click()
  await expect(page.locator('.backup-strip.error')).toContainText('앱 밖에서 변경')
  expect((await readFile()).records[0].studentName).toBe('Changed outside app')

  await page.getByRole('button', { name: '백업 폴더 선택' }).click()
  await expect(page.locator('.backup-strip.conflict')).toContainText('폴더 백업 2건과 브라우저 기록 3건')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '현재 기록을 폴더에 저장' }).click()
  await expect(page.locator('.backup-strip.ready')).toContainText('브라우저 기록 3건을 저장')
  expect((await readFile()).records).toHaveLength(3)
  const safetyCopy = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('EDM')
    for await (const entry of directory.values()) {
      if (entry.name.startsWith('sop-score-tracker-before-replace-')) {
        const file = await (entry as FileSystemFileHandle).getFile()
        return JSON.parse(await file.text()) as { records: { studentName: string }[] }
      }
    }
    return null
  })
  expect(safetyCopy?.records[0].studentName).toBe('Changed outside app')
  expect(browserErrors).toEqual([])
})
