import { launch, shot, BASE } from './lib.mjs'
const { browser, page } = await launch()
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form[data-auth-ready="1"]', { timeout: 30000 }).catch(() => {})
  await page.locator('input[type="email"]').first().fill('employee@acme.com')
  await page.locator('input[type="password"]').first().fill('secret')
  await page.locator('input[type="password"]').first().press('Enter')
  await page.waitForTimeout(6000)
  console.log('after submit url:', page.url())
  await shot(page, '4255-2-login-mfa-challenge')
} finally { await browser.close() }
