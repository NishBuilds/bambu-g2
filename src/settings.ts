import type { PrinterSettings } from './types'

const STORAGE_KEY = 'bambu-g2-settings-v1'

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)))
}

export function clearSensitiveSettings(settings: PrinterSettings): PrinterSettings {
  const next = { ...settings, accessCode: '' }
  saveSettings(next)
  return next
}

export function hasMinimumConnectionSettings(settings: PrinterSettings): boolean {
  return Boolean(settings.bridgeUrl.trim())
}

function defaultBridgeUrl(): string {
  const isBridgeHosted = window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (isBridgeHosted && window.location.host) return `${protocol}//${window.location.host}/ws`
  }
  return ''
}

function settingsFromStorage(): Partial<PrinterSettings> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? (parsed as Partial<PrinterSettings>) : {}
  } catch {
    return {}
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
    bridgeUrl: settings.bridgeUrl.trim(),
    alertOnError: Boolean(settings.alertOnError),
  }
}
