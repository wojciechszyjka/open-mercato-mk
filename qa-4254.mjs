import { execSync } from 'node:child_process'
import { launch, login, shot, visit, BASE } from './lib.mjs'

const TENANT_ID = '4d2c9d62-72e7-4d45-ade3-d782de8d2795'
const EMPLOYEE_ID = '79035f12-a63b-48aa-9674-5ef8a0dce704'

function psql(sql) {
  return execSync(`docker exec mercato-postgres psql -U postgres -d mercato_qa -t -A -c "${sql}"`).toString().trim()
}

async function apiLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, token: body.token }
}

psql('DELETE FROM mfa_enforcement_policies')
const admin = await apiLogin('superadmin@acme.com', 'secret')
console.log(`[1] superadmin API login: ${admin.status}`)

const createRes = await fetch(`${BASE}/api/security/enforcement`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
  body: JSON.stringify({ scope: 'tenant', tenantId: TENANT_ID, organizationId: null, isEnforced: true, allowedMethods: null, enforcementDeadline: null }),
})
const created = await createRes.json().catch(() => ({}))
console.log(`[2] create enforcement policy (scope=tenant, isEnforced=true): HTTP ${createRes.status} id=${created?.id}`)

const { browser, page } = await launch()
try {
  console.log('[3] browser login as employee@acme.com')
  await login(page, 'employee@acme.com', 'secret')
  console.log(`    after login url: ${page.url()}`)

  console.log('[4] baseline: employee visits protected /backend/customers/people')
  await visit(page, '/backend/customers/people')
  console.log(`    landed on: ${page.url()}`)
  await shot(page, '4254-1-baseline-mfa-redirect')

  console.log('[5] exempt path: /backend/profile/security must stay reachable')
  await visit(page, '/backend/profile/security')
  console.log(`    landed on: ${page.url()}`)
  await shot(page, '4254-2-exempt-profile-security')

  console.log('[6] FAIL-CLOSED probe: soft-delete employee in DB, revisit in same session')
  psql(`UPDATE users SET deleted_at = now() WHERE id = '${EMPLOYEE_ID}'`)
  await visit(page, '/backend/customers/people')
  console.log(`    landed on: ${page.url()}`)
  await shot(page, '4254-3-deleted-user-fail-closed')

  console.log('[7] restore employee user')
  psql(`UPDATE users SET deleted_at = NULL WHERE id = '${EMPLOYEE_ID}'`)
} finally {
  await browser.close()
}

if (created?.id) {
  const del = await fetch(`${BASE}/api/security/enforcement/${created.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${admin.token}` },
  })
  console.log(`[8] cleanup DELETE policy: HTTP ${del.status}`)
}
console.log('DONE')
