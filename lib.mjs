import { chromium } from 'playwright'

export const BASE = process.env.QA_BASE_URL || 'http://localhost:3010'
export const OUT = new URL('./shots/', import.meta.url).pathname

export async function launch() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  return { browser, context, page }
}

export async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form[data-auth-ready="1"]', { timeout: 30000 }).catch(() => {})
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('input[type="password"]').first().press('Enter')
  await page.waitForURL('**/backend**', { timeout: 60000 })
}

export async function visit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

export async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false })
  console.log(`[shot] ${name}.png url=${page.url()}`)
}
