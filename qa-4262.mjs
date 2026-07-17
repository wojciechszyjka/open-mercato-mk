import { launch, login, shot, BASE } from './lib.mjs'

const phase = process.argv[2] || 'after'

const { browser, page } = await launch()
try {
  await login(page, 'admin@acme.com', 'secret')
  await page.goto(`${BASE}/checkout-demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#customer-select', { timeout: 60000 })
  await page.waitForTimeout(2000)

  await page.locator('#customer-select').click()
  await page.locator('[role="option"]').first().click()
  console.log('[1] customer selected')

  await page.locator('#product-select').click()
  await page.locator('[role="option"]').first().click()
  console.log('[2] product added to cart')
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: 'Start Checkout Workflow' }).click()
  console.log('[3] workflow started')

  await page.waitForSelector('form input, form textarea', { timeout: 30000 })
  await page.waitForTimeout(1000)
  const filled = await page.evaluate(() => {
    const out = []
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const taSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    for (const el of document.querySelectorAll('form input, form textarea')) {
      if (el.type === 'checkbox' || el.type === 'radio') continue
      let value = 'QA Test'
      if (el.type === 'email' || el.id.toLowerCase().includes('email')) value = 'qa-4262@example.com'
      if (el.type === 'tel' || el.id.toLowerCase().includes('phone')) value = '+48123123123'
      ;(el.tagName === 'TEXTAREA' ? taSetter : setter).call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      out.push(el.id || el.name)
    }
    return out
  })
  console.log(`[4] user-task form filled: ${filled.join(', ')}`)
  await page.getByRole('button', { name: /Complete & Continue Checkout/ }).click()
  console.log('[5] user task submitted')

  const webhookBtn = page.getByRole('button', { name: /Simulate Payment Webhook/ })
  await webhookBtn.waitFor({ timeout: 60000 })
  await page.waitForTimeout(1000)
  await webhookBtn.click()
  console.log('[6] payment webhook simulated — waiting for outcome (max 90s)')

  const deadline = Date.now() + 90000
  let outcome = 'TIMEOUT'
  while (Date.now() < deadline) {
    if (await page.getByText('Order Confirmed!', { exact: false }).count() > 0) { outcome = 'ORDER_CONFIRMED'; break }
    await page.waitForTimeout(2000)
  }
  const statusBadge = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('span,div'))
      .map((n) => n.textContent?.trim() ?? '')
    return ['COMPLETED', 'WAITING_FOR_ACTIVITIES', 'RUNNING', 'FAILED'].find((s) => texts.some((t) => t === s)) ?? 'unknown'
  })
  console.log(`[7] outcome=${outcome} workflowStatusBadge=${statusBadge}`)
  await shot(page, `4262-${phase}-outcome`)
} finally {
  await browser.close()
}
console.log('DONE', phase)
