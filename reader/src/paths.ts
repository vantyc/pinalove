/** Paths live outside the git clone. Never write session files into the repo. */
export const READER_STATE_DIR = '/home/dev/.local/state/pinalove-reader'
export const CHROMIUM_PROFILE_DIR = `${READER_STATE_DIR}/chromium-profile`
export const CHROME_PROFILE_DIR = `${READER_STATE_DIR}/chrome-profile`
export const RUNS_DIR = `${READER_STATE_DIR}/runs`
export const BROWSER_META_PATH = `${READER_STATE_DIR}/browser.json`
export const CDP_PORT = 9333
export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`
export const PINALOVE_ORIGIN = 'https://www.pinalove.com'
export const PINALOVE_HOME = `${PINALOVE_ORIGIN}/`
export const PINALOVE_APP = `${PINALOVE_ORIGIN}/et/`
export const SYSTEM_CHROMIUM = '/usr/bin/chromium'

export type BrowserMeta = {
  kind: 'playwright-chromium' | 'google-chrome-flatpak'
  cdpUrl?: string
  pid: number
  userDataDir: string
  startedAt: string
}
