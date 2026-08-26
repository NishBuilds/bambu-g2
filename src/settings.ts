import type { PrinterSettings } from './types'

const STORAGE_KEY = 'bambu-g2-settings-v1'

export type NativeSettingsStore = {
  getLocalStorage(key: string): Promise<string>
  setLocalStorage(key: string, value: string): Promise<boolean>
}

export const DEFAULT_SETTINGS: PrinterSettings = {
  printerHost: '',
  printerPort: 8883,
  serialNumber: '',
  accessCode: '',
  bridgeUrl: defaultBridgeUrl(),
  alertOnError: true,
}

export function loadSettings(): PrinterSettings {
  const fromQuery = settingsFromQuery()
  const saved = settingsFromStorage()
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...saved, ...fromQuery })
}

export function saveSettings(settings: PrinterSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)))
  } catch {
    return
  }
}

export function clearSensitiveSettings(settings: PrinterSettings): PrinterSettings {
  return sanitizeSettings({ ...settings, accessCode: '' })
}

export async function loadSettingsFromNativeStorage(store: NativeSettingsStore): Promise<PrinterSettings | undefined> {
  try {
    return settingsFromRaw(await store.getLocalStorage(STORAGE_KEY))
  } catch {
    return undefined
  }
}

export async function saveSettingsToNativeStorage(store: NativeSettingsStore, settings: PrinterSettings): Promise<void> {
  try {
    await store.setLocalStorage(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)))
  } catch {
    return
  }
}

export function hasMinimumConnectionSettings(settings: PrinterSettings): boolean {
  return Boolean(settings.bridgeUrl.trim())
}

function isBridgeHosted(): boolean {
  return window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')
}

function defaultBridgeUrl(): string {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (isBridgeHosted() && window.location.host) return `${protocol}//${window.location.host}/ws`
  }
  return ''
}

function settingsFromStorage(): Partial<PrinterSettings> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return settingsFromRaw(raw) ?? {}
  } catch {
    return {}
  }
}

function settingsFromRaw(raw: string | null | undefined): PrinterSettings | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const partial = parsed as Partial<PrinterSettings>
    if (typeof partial.bridgeUrl === 'string' && isIgnoredLoopbackBridgeUrl(partial.bridgeUrl)) {
      delete partial.bridgeUrl
    }
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...partial })
  } catch {
    return undefined
  }
}

function settingsFromQuery(): Partial<PrinterSettings> {
  const params = new URLSearchParams(window.location.search)
  const settings: Partial<PrinterSettings> = {}
  if (params.has('host')) settings.printerHost = params.get('host') ?? ''
  if (params.has('port')) settings.printerPort = Number(params.get('port'))
  if (params.has('serial')) settings.serialNumber = params.get('serial') ?? ''
  if (params.has('accessCode')) settings.accessCode = params.get('accessCode') ?? ''
  if (params.has('bridge')) settings.bridgeUrl = params.get('bridge') ?? ''
  if (params.has('alerts')) settings.alertOnError = params.get('alerts') !== '0'

  if (Object.keys(settings).length > 0) {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
  return settings
}

function sanitizeSettings(settings: PrinterSettings): PrinterSettings {
  const port = Number(settings.printerPort)
  return {
    printerHost: settings.printerHost.trim(),
    printerPort: Number.isFinite(port) && port > 0 ? Math.round(port) : DEFAULT_SETTINGS.printerPort,
    serialNumber: settings.serialNumber.trim(),
    accessCode: settings.accessCode.trim(),
    bridgeUrl: sanitizeBridgeUrl(settings.bridgeUrl),
    alertOnError: Boolean(settings.alertOnError),
  }
}

function sanitizeBridgeUrl(value: string): string {
  const bridgeUrl = value.trim()
  if (!bridgeUrl) return ''
  if (isIgnoredLoopbackBridgeUrl(bridgeUrl)) return ''
  return bridgeUrl
}

function isIgnoredLoopbackBridgeUrl(value: string): boolean {
  if (!/^wss?:\/\/(?:localhost|127\.0\.0\.1):8983\/ws\/?$/i.test(value.trim())) return false
  return !(isBridgeHosted() && isLoopbackPageHost())
}

function isLoopbackPageHost(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}
