import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.QA_BASE || 'http://127.0.0.1:51878'
const OUT = process.env.QA_OUT || path.resolve('.')
const MESSAGE = 'Add at least one line item before creating the order.'

fs.mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log('[qa]', ...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })

const loginRes = await ctx.request.post(`${BASE}/api/auth/login`, {
  form: { email: 'admin@acme.com', password: 'secret' },
})
log('login status', loginRes.status())

const page = await ctx.newPage()
await page.goto(`${BASE}/backend/sales/documents/create`, { waitUntil: 'networkidle', timeout: 240000 })
await page.addStyleTag({ content: '.z-banner,[data-demo-banner]{display:none!important}' })
await page.waitForTimeout(2000)

const countText = async () => page.evaluate((msg) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const hits = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.textContent || !node.textContent.includes(msg)) continue
    const el = node.parentElement
    if (!el) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    hits.push({
      tag: el.tagName,
      cls: typeof el.className === 'string' ? el.className : '',
      role: el.getAttribute('role'),
      text: node.textContent.trim().slice(0, 90),
    })
  }
  return { n: hits.length, hits }
}, MESSAGE)

// Switch the document kind to Order — the lines block only renders for orders.
await page.getByRole('button', { name: 'Order', exact: true }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: path.join(OUT, '01-order-kind.png'), fullPage: true })
const before = await countText()
log('before submit:', JSON.stringify(before, null, 2))

const submit = page.getByRole('button', { name: 'Create', exact: true }).first()
await submit.scrollIntoViewIfNeeded()
await submit.evaluate((el) => el.click())
await page.waitForTimeout(3500)
await page.screenshot({ path: path.join(OUT, '02-after-submit.png'), fullPage: true })

const after = await countText()
log('after submit:', JSON.stringify(after, null, 2))
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ before, after }, null, 2))

await browser.close()
