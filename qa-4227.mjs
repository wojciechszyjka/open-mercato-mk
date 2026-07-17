import { chromium } from 'playwright'
import { shot, BASE } from './lib.mjs'

const SLUG = 'january-consulting-4d2c9d62'

const info = await fetch(`${BASE}/api/checkout/pay/${SLUG}`).then((r) => r.json()).catch(() => null)
console.log('[public link info] fields:', JSON.stringify((info?.customerFieldsSchema || info?.link?.customerFieldsSchema || []).map((f) => ({ key: f.key, kind: f.kind, required: f.required }))))

async function runLocale(locale, expectedText) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'locale', value: locale, domain: 'localhost', path: '/' }])
  const page = await context.newPage()
  const submitResponses = []
  page.on('response', (res) => {
    if (res.url().includes(`/api/checkout/pay/${SLUG}/submit`)) submitResponses.push(res)
  })
  try {
    await page.goto(`${BASE}/pay/${SLUG}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    if (locale === 'pl') {
      const a11y = await page.evaluate(() => {
        const results = []
        for (const input of document.querySelectorAll('[id^="checkout-customer-"]')) {
          if (input.id.endsWith('-error')) continue
          results.push({
            id: input.id,
            tag: input.tagName.toLowerCase(),
            hasLabelFor: !!document.querySelector(`label[for="${input.id}"]`),
            ariaRequired: input.getAttribute('aria-required'),
            ariaInvalid: input.getAttribute('aria-invalid'),
            ariaDescribedby: input.getAttribute('aria-describedby'),
          })
        }
        return results
      })
      console.log('[a11y fields initial]', JSON.stringify(a11y, null, 1))
      await shot(page, '4227-1-paypage-pl')

      const submitBtn = page.locator('button.h-12.w-full').last()
      await submitBtn.click()
      await page.waitForTimeout(1200)
      const a11yErr = await page.evaluate(() => {
        const results = []
        for (const input of document.querySelectorAll('[id^="checkout-customer-"]')) {
          if (input.id.endsWith('-error')) continue
          const desc = input.getAttribute('aria-describedby')
          results.push({
            id: input.id,
            ariaInvalid: input.getAttribute('aria-invalid'),
            ariaDescribedby: desc,
            errorElementExists: desc ? !!document.getElementById(desc) : null,
          })
        }
        return results
      })
      console.log('[a11y fields after empty submit]', JSON.stringify(a11yErr, null, 1))
      await shot(page, '4227-2-paypage-validation-errors')
    }

    const filled = await page.evaluate(() => {
      const out = []
      for (const input of document.querySelectorAll('input[id^="checkout-customer-"]')) {
        const type = input.getAttribute('type') || 'text'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        if (type === 'checkbox') continue
        let value = 'QA Test'
        if (type === 'email' || input.id.toLowerCase().includes('email')) value = 'qa-test@example.com'
        if (type === 'tel' || input.id.toLowerCase().includes('phone')) value = '+48123123123'
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        out.push(input.id)
      }
      return out
    })
    console.log(`[fill:${locale}] filled inputs: ${filled.length}`)
    for (const cb of await page.locator('form [role="checkbox"][data-state="unchecked"], form input[type="checkbox"]:not(:checked)').all()) {
      await cb.click().catch(() => {})
    }
    await page.locator('button.h-12.w-full').last().click()
    await page.waitForTimeout(5000)

    const last = submitResponses[submitResponses.length - 1]
    if (last) {
      const status = last.status()
      const body = await last.text().catch(() => '')
      console.log(`[submit:${locale}] HTTP ${status} body=${body.slice(0, 140)}`)
    } else {
      console.log(`[submit:${locale}] no submit request captured`)
    }
    const visible = await page.getByText(expectedText, { exact: false }).count()
    console.log(`[i18n:${locale}] expected text "${expectedText}" visible: ${visible > 0 ? 'YES' : 'NO'}`)
    await shot(page, `4227-3-session-start-error-${locale}`)
  } finally {
    await browser.close()
  }
}

await runLocale('pl', 'Nie udało się uruchomić sesji płatności')
await runLocale('de', 'Die Zahlungssitzung konnte nicht gestartet werden')
await runLocale('en', 'Unable to start the payment session')
console.log('DONE')
