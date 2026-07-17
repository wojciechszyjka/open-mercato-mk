import { launch, login, shot, BASE } from './lib.mjs'

async function apiLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return body.token
}

const token = await apiLogin('admin@acme.com', 'secret')
console.log(`[login] admin token: ${token ? 'ok' : 'FAIL'}`)

async function call(method, path, payload, raw) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: raw !== undefined ? raw : payload === undefined ? undefined : JSON.stringify(payload),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 120) }
  return { status: res.status, body }
}

const dict = await call('POST', '/api/dictionaries', { key: 'qa_curl_dict', name: 'QA Curl Dict' })
console.log(`[setup] create dictionary: HTTP ${dict.status} id=${dict.body?.id}`)
const DICT = dict.body?.id

const entry = await call('POST', `/api/dictionaries/${DICT}/entries`, { value: 'ok', label: 'OK', color: '#3366ff' })
console.log(`[positive] create entry: HTTP ${entry.status} id=${entry.body?.id}`)
const ENTRY = entry.body?.id

const cases = [
  ['GET list, non-UUID dictionaryId', 'GET', '/api/dictionaries/not-a-uuid/entries'],
  ['POST create, non-UUID dictionaryId', 'POST', '/api/dictionaries/not-a-uuid/entries', { value: 'x' }],
  ['POST create, empty value', 'POST', `/api/dictionaries/${DICT}/entries`, { value: '' }],
  ['POST create, malformed JSON', 'POST', `/api/dictionaries/${DICT}/entries`, undefined, '{ not json'],
  ['POST create, invalid color', 'POST', `/api/dictionaries/${DICT}/entries`, { value: 'ok2', color: 'notacolor' }],
  ['PATCH update, empty value', 'PATCH', `/api/dictionaries/${DICT}/entries/${ENTRY}`, { value: '' }],
  ['POST reorder, missing entries', 'POST', `/api/dictionaries/${DICT}/entries/reorder`, {}],
  ['POST reorder, negative position', 'POST', `/api/dictionaries/${DICT}/entries/reorder`, { entries: [{ id: ENTRY, position: -1 }] }],
  ['POST set-default, empty payload', 'POST', `/api/dictionaries/${DICT}/entries/set-default`, {}],
  ['POST set-default, non-UUID entryId', 'POST', `/api/dictionaries/${DICT}/entries/set-default`, { entryId: 'not-a-uuid' }],
]

let all400 = true
for (const [name, method, path, payload, raw] of cases) {
  const r = await call(method, path, payload, raw)
  const pass = r.status === 400
  if (!pass) all400 = false
  console.log(`[invalid] ${name}: HTTP ${r.status} ${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(r.body).slice(0, 100)}`)
}
console.log(`[invalid battery] ${all400 ? 'ALL 400 — PASS' : 'SOME NOT 400 — FAIL'}`)

const upd = await call('PATCH', `/api/dictionaries/${DICT}/entries/${ENTRY}`, { label: 'OK updated' })
const reo = await call('POST', `/api/dictionaries/${DICT}/entries/reorder`, { entries: [{ id: ENTRY, position: 0 }] })
const def = await call('POST', `/api/dictionaries/${DICT}/entries/set-default`, { entryId: ENTRY })
console.log(`[positive] PATCH=${upd.status} reorder=${reo.status} set-default=${def.status}`)

const { browser, page } = await launch()
try {
  await login(page, 'admin@acme.com', 'secret')
  await page.goto(`${BASE}/backend/config/dictionaries?dictionaryId=${DICT}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await shot(page, '4226-1-dictionaries-page')

  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.waitForSelector('#dictionary-entry-value', { timeout: 15000 })
  const a11yBefore = await page.evaluate(() => {
    const input = document.getElementById('dictionary-entry-value')
    const label = document.querySelector('label[for="dictionary-entry-value"]')
    const dialog = document.querySelector('[role="dialog"]')
    return {
      inputExists: !!input,
      labelForMatches: !!label,
      ariaRequired: input?.getAttribute('aria-required'),
      ariaInvalid: input?.getAttribute('aria-invalid'),
      ariaDescribedbyBeforeError: input?.getAttribute('aria-describedby'),
      ariaModal: dialog?.getAttribute('aria-modal'),
      labelFieldId: !!document.querySelector('label[for="dictionary-entry-label"]') && !!document.getElementById('dictionary-entry-label'),
    }
  })
  console.log('[a11y before error]', JSON.stringify(a11yBefore))
  await shot(page, '4226-2-entry-dialog-open')

  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(800)
  const a11yAfter = await page.evaluate(() => {
    const input = document.getElementById('dictionary-entry-value')
    const err = document.getElementById('dictionary-entry-value-error')
    return {
      ariaInvalid: input?.getAttribute('aria-invalid'),
      ariaDescribedbyAfterError: input?.getAttribute('aria-describedby'),
      errorElementExists: !!err,
      errorText: err?.textContent ?? null,
    }
  })
  console.log('[a11y after empty save]', JSON.stringify(a11yAfter))
  await shot(page, '4226-3-entry-dialog-validation-error')

  await page.locator('#dictionary-entry-value').fill('shortcut-test')
  await page.locator('#dictionary-entry-value').press('Meta+Enter')
  await page.waitForTimeout(2000)
  const rowVisible = await page.getByText('shortcut-test', { exact: false }).count()
  console.log(`[cmd+enter save] entry row visible: ${rowVisible > 0 ? 'YES' : 'NO'}`)
  await shot(page, '4226-4-entry-saved-via-cmd-enter')
} finally {
  await browser.close()
}

const cleanup = await call('DELETE', `/api/dictionaries/${DICT}`)
console.log(`[cleanup] delete dictionary: HTTP ${cleanup.status}`)
console.log('DONE')
