#!/usr/bin/env node
/**
 * Trakt OAuth device flow — one-time interactive auth.
 *
 * Flow:
 *   1. POST /oauth/device/code → user_code, device_code, verification_url
 *   2. Print user_code + URL → user activates at trakt.tv/activate
 *   3. Poll /oauth/device/token until success or expiry
 *   4. Save { access_token, refresh_token, expires_at, scope } to /usr/src/app/db/.trakt-token.json
 *
 * Env: TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET
 *
 * Usage:
 *   docker exec -it personal-website-backend node /usr/src/app/scripts/trakt-device-auth.js
 */
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERR: TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET env vars required');
  process.exit(1);
}

const TOKEN_FILE = path.resolve(__dirname, '../db/.trakt-token.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. request device code
  console.log('Requesting device code from Trakt...');
  const codeRes = await fetch('https://api.trakt.tv/oauth/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'koimsurai/1.0 (+https://koimsurai.com)',
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!codeRes.ok) throw new Error(`device/code ${codeRes.status}: ${await codeRes.text()}`);
  const { device_code, user_code, verification_url, expires_in, interval } = await codeRes.json();

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│                                                         │');
  console.log(`│  Activation URL : ${verification_url.padEnd(38)}│`);
  console.log(`│  User code      : ${String(user_code).padEnd(38)}│`);
  console.log(`│  Expires in     : ${String(expires_in).padStart(4)} seconds                          │`);
  console.log('│                                                         │');
  console.log('│  → Open the URL, paste the code, click ALLOW             │');
  console.log('│  → This script polls every ' + interval + 's and exits when done           │');
  console.log('│                                                         │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  // 2. poll for token
  const deadline = Date.now() + expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const t = await fetch('https://api.trakt.tv/oauth/device/token', {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'koimsurai/1.0 (+https://koimsurai.com)',
    },
      body: JSON.stringify({
        code: device_code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (t.status === 200) {
      const tok = await t.json();
      const out = {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        scope: tok.scope,
        expires_at: (tok.created_at + tok.expires_in) * 1000,  // ms epoch
        created_at: tok.created_at * 1000,
      };
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(out, null, 2));
      fs.chmodSync(TOKEN_FILE, 0o600);
      console.log('✓ Token saved to', TOKEN_FILE);
      console.log(`  scope=${out.scope}  expires=${new Date(out.expires_at).toISOString()}`);
      return;
    }
    if (t.status === 400) { process.stdout.write('.'); continue; } // pending
    if (t.status === 404) throw new Error('Not found — device code invalid');
    if (t.status === 409) throw new Error('Already used');
    if (t.status === 410) throw new Error('Expired');
    if (t.status === 418) throw new Error('Denied by user');
    if (t.status === 429) { console.log('rate-limited, slowing down'); await sleep(5000); continue; }
    throw new Error(`unexpected ${t.status}: ${await t.text()}`);
  }
  throw new Error('Timed out waiting for user activation');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
