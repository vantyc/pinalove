import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  BROWSER_META_PATH,
  CHROME_PROFILE_DIR,
  PINALOVE_HOME,
  READER_STATE_DIR,
} from './paths.ts'
import type { BrowserMeta } from './paths.ts'

/**
 * Login must use a real Google Chrome instance, not Playwright Chromium.
 * Google rejects Chromium / automation flags ("This browser or app may not be secure").
 * We do not hide webdriver or strip Google's checks. We follow Google's own
 * prompt: use a supported browser. Dedicated profile, not the personal one.
 */
async function main(): Promise<void> {
  await mkdir(CHROME_PROFILE_DIR, { recursive: true, mode: 0o700 })
  await mkdir(READER_STATE_DIR, { recursive: true, mode: 0o700 })

  const child = spawn(
    'flatpak',
    [
      'run',
      `--filesystem=${READER_STATE_DIR}:create`,
      'com.google.Chrome',
      `--user-data-dir=${CHROME_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      PINALOVE_HOME,
    ],
    {
      env: process.env,
      stdio: 'ignore',
      detached: true,
    },
  )
  child.unref()
  if (!child.pid) {
    throw new Error('STOP: failed to start Google Chrome.')
  }

  const meta: BrowserMeta = {
    kind: 'google-chrome-flatpak',
    pid: child.pid,
    userDataDir: CHROME_PROFILE_DIR,
    startedAt: new Date().toISOString(),
  }
  await writeFile(BROWSER_META_PATH, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 })

  console.log('PinaLove Reader login browser is open (Google Chrome, dedicated profile).')
  console.log('This is NOT your personal Chrome profile. Do not use your usual Chrome window.')
  console.log('Manual steps:')
  console.log('  1. In the NEW Chrome window, click Sign in with Google.')
  console.log('  2. Complete Google login yourself. I will not automate OAuth.')
  console.log('  3. Open Lists → Matches and confirm you see your matches.')
  console.log('  4. Reply "listo" in chat. Keep that window open.')
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(message)
  process.exit(1)
})
