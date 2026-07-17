import crypto from 'node:crypto'
import { launch, login, shot, visit, BASE } from './lib.mjs'

async function apiLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, token: body.token }
}

async function call(token, method, path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 200) }
  return { status: res.status, body }
}

function base32decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.replace(/=+$/g, '').toUpperCase()
  let bits = 0, value = 0
  const out = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function totp(secretBase32, timestamp = Date.now()) {
  const key = base32decode(secretBase32)
  const counter = Math.floor(timestamp / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
  return code
}

const phase = process.argv[2] || 'before-sync'

const emp = await apiLogin('employee@acme.com', 'secret')
console.log(`[login] employee@acme.com: ${emp.status}`)

const enroll = await call(emp.token, 'POST', '/api/security/mfa/provider/totp', {})
console.log(`[POST /api/security/mfa/provider/totp] HTTP ${enroll.status} ${enroll.status !== 200 ? JSON.stringify(enroll.body) : '(setup started)'}`)

const regen = await call(emp.token, 'POST', '/api/security/mfa/recovery-codes/regenerate', {})
console.log(`[POST /api/security/mfa/recovery-codes/regenerate] HTTP ${regen.status} ${regen.status !== 200 ? JSON.stringify(regen.body) : `(codes: ${regen.body?.recoveryCodes?.length})`}`)

const delDummy = await call(emp.token, 'DELETE', '/api/security/mfa/methods/00000000-0000-0000-0000-000000000000')
console.log(`[DELETE /api/security/mfa/methods/{dummy}] HTTP ${delDummy.status} ${JSON.stringify(delDummy.body)}`)

const putDummy = await call(emp.token, 'PUT', '/api/security/mfa/provider/totp', { setupId: 'dummy', payload: { code: '000000' } })
console.log(`[PUT /api/security/mfa/provider/totp (dummy)] HTTP ${putDummy.status} ${JSON.stringify(putDummy.body).slice(0, 120)}`)

if (phase === 'after-sync') {
  if (enroll.status !== 200 || !enroll.body?.setupId) {
    console.log('!! expected enrollment to start after sync, aborting positive path')
    process.exit(1)
  }
  const secret = enroll.body?.clientData?.secret
  console.log(`[enroll] setupId=${enroll.body.setupId} secret=${secret ? 'received (base32)' : 'MISSING'}`)
  const confirm = await call(emp.token, 'PUT', '/api/security/mfa/provider/totp', {
    setupId: enroll.body.setupId,
    payload: { code: totp(secret) },
  })
  console.log(`[PUT confirm with real TOTP] HTTP ${confirm.status} ok=${confirm.body?.ok} recoveryCodes=${confirm.body?.recoveryCodes?.length}`)

  const methods = await call(emp.token, 'GET', '/api/security/mfa/methods')
  const totpMethod = (methods.body?.methods || []).find((m) => m.type === 'totp' || m.provider === 'totp')
  console.log(`[GET methods] HTTP ${methods.status} methods=${JSON.stringify(methods.body?.methods?.map((m) => ({ id: m.id, type: m.type ?? m.provider })))}`)

  const { browser, page } = await launch()
  try {
    await login(page, 'employee@acme.com', 'secret')
    await visit(page, '/backend/profile/security/mfa')
    await shot(page, '4255-1-employee-mfa-enrolled')
  } finally {
    await browser.close()
  }

  if (totpMethod) {
    const del = await call(emp.token, 'DELETE', `/api/security/mfa/methods/${totpMethod.id}`)
    console.log(`[DELETE real method] HTTP ${del.status} ${JSON.stringify(del.body)}`)
  }
}
console.log('DONE', phase)
