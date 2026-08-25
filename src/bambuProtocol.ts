import type {
  BambuAlert,
  BambuCommandPayload,
  BambuMqttPayload,
  BambuRawPrintReport,
  BambuSpeedLevel,
  PrinterSnapshot,
} from './types'

const SPEED_LABELS: Record<BambuSpeedLevel, string> = {
  1: 'Silent',
  2: 'Standard',
  3: 'Sport',
  4: 'Ludicrous',
}

const STAGE_LABELS: Record<string, string> = {
  '0': 'Idle',
  '1': 'Prepare',
  '2': 'Printing',
  '3': 'Paused',
  '4': 'Finished',
  '5': 'Failed',
  '6': 'Cancelled',
  '7': 'Scanning',
  '8': 'Heating',
  '9': 'Calibrating',
  '14': 'Changing filament',
}

export function speedLabel(level: BambuSpeedLevel): string {
  return SPEED_LABELS[level]
}

export function parseBambuPayload(raw: unknown, previous?: PrinterSnapshot): PrinterSnapshot | undefined {
  const payload = asPayload(raw)
  if (!payload?.print) return previous

  const print: BambuRawPrintReport = {
    ...(previous?.rawPrint ?? {}),
    ...payload.print,
  }

  const alerts = collectAlerts(print)
  const speedLevel = toSpeedLevel(print.spd_lvl, previous?.speedLevel ?? 2)
  const fileName = stringValue(print.gcode_file) || stringValue(print.subtask_name)
  const printName = stringValue(print.subtask_name) || trimKnownPrintExtension(fileName) || 'No active print'
  const state = stringValue(print.gcode_state) || previous?.gcodeState || 'UNKNOWN'
  const stageRaw = stringValue(print.mc_print_stage)
  const stage = STAGE_LABELS[stageRaw] ?? stageRaw

  return {
    printerName: previous?.printerName ?? 'Bambu Printer',
    printName,
    fileName,
    gcodeState: state,
    progress: clampPercent(numberValue(print.mc_percent, previous?.progress ?? 0)),
    remainingMinutes: Math.max(0, Math.round(numberValue(print.mc_remaining_time, previous?.remainingMinutes ?? 0))),
    nozzleTemp: numberValue(print.nozzle_temper, previous?.nozzleTemp ?? 0),
    nozzleTarget: numberValue(print.nozzle_target_temper, previous?.nozzleTarget ?? 0),
    bedTemp: numberValue(print.bed_temper, previous?.bedTemp ?? 0),
    bedTarget: numberValue(print.bed_target_temper, previous?.bedTarget ?? 0),
    chamberTemp: optionalNumber(print.chamber_temper, previous?.chamberTemp),
    speedLevel,
    speedPercent: Math.max(0, Math.round(numberValue(print.spd_mag, previous?.speedPercent ?? speedPercentForLevel(speedLevel)))),
    currentLayer: Math.max(0, Math.round(numberValue(print.layer_num, previous?.currentLayer ?? 0))),
    totalLayers: Math.max(0, Math.round(numberValue(print.total_layer_num, previous?.totalLayers ?? 0))),
    stage: stage || state,
    wifiSignal: stringValue(print.wifi_signal) || previous?.wifiSignal || '--',
    printType: stringValue(print.print_type) || previous?.printType || '--',
    alerts,
    rawPrint: print,
    updatedAt: Date.now(),
  }
}

export function buildPauseCommand(sequenceId = sequenceIdNow()): BambuCommandPayload {
  return {
    print: {
      sequence_id: sequenceId,
      command: 'pause',
    },
  }
}

export function buildResumeCommand(sequenceId = sequenceIdNow()): BambuCommandPayload {
  return {
    print: {
      sequence_id: sequenceId,
      command: 'resume',
    },
  }
}

export function buildSpeedCommand(level: BambuSpeedLevel, sequenceId = sequenceIdNow()): BambuCommandPayload {
  if (!isSpeedLevel(level)) {
    throw new Error('Bambu speed level must be 1, 2, 3, or 4')
  }

  return {
    print: {
      sequence_id: sequenceId,
      command: 'print_speed',
      param: String(level),
    },
  }
}

export function isPrintingState(snapshot: PrinterSnapshot | undefined): boolean {
  if (!snapshot) return false
  return ['RUNNING', 'PREPARE', 'PAUSE'].includes(snapshot.gcodeState.toUpperCase())
}

export function isPausedState(snapshot: PrinterSnapshot | undefined): boolean {
  return snapshot?.gcodeState.toUpperCase() === 'PAUSE'
}

export function makeDemoSnapshot(progressSeed = 34): PrinterSnapshot {
  const progress = clampPercent(progressSeed)
  const remainingMinutes = Math.max(0, Math.round((100 - progress) * 2.6))

  return {
    printerName: 'Bambu Printer',
    printName: 'Gridfinity Drawer',
    fileName: 'gridfinity_drawer.gcode.3mf',
    gcodeState: progress >= 100 ? 'FINISH' : 'RUNNING',
    progress,
    remainingMinutes,
    nozzleTemp: 221.6,
    nozzleTarget: 220,
    bedTemp: 60.3,
    bedTarget: 60,
    chamberTemp: 31,
    speedLevel: 2,
    speedPercent: 100,
    currentLayer: Math.max(1, Math.round(progress * 1.62)),
    totalLayers: 162,
    stage: progress >= 100 ? 'Finished' : 'Printing',
    wifiSignal: '-47dBm',
    printType: 'local',
    alerts: [],
    rawPrint: {},
    updatedAt: Date.now(),
  }
}

function asPayload(raw: unknown): BambuMqttPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  if ('print' in raw) return raw as BambuMqttPayload
  if ('payload' in raw) {
    const nested = (raw as { payload?: unknown }).payload
    if (typeof nested === 'string') {
      try {
        return asPayload(JSON.parse(nested))
      } catch {
        return undefined
      }
    }
    return asPayload(nested)
  }
  return undefined
}

function collectAlerts(print: BambuRawPrintReport): BambuAlert[] {
  const alerts: BambuAlert[] = []
  const errorCode = numberValue(print.print_error, 0)
  if (errorCode !== 0) {
    alerts.push({
      code: String(Math.round(errorCode)),
      severity: 'error',
      message: 'Printer reported an active print error.',
    })
  }

  const hms = Array.isArray(print.hms) ? print.hms : []
  for (const item of hms) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const code = stringValue(record.code) || stringValue(record.err_code) || stringValue(record.attr) || 'HMS'
    const message =
      stringValue(record.msg) ||
      stringValue(record.message) ||
      stringValue(record.description) ||
      'Printer health message reported.'
    alerts.push({ code, message, severity: 'warning' })
  }

  return alerts
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function optionalNumber(value: unknown, fallback: number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return fallback
  return numberValue(value, fallback ?? 0)
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function trimKnownPrintExtension(fileName: string): string {
  return fileName.replace(/\.gcode(?:\.3mf)?$/i, '').replace(/[_-]+/g, ' ').trim()
}

function toSpeedLevel(value: unknown, fallback: BambuSpeedLevel): BambuSpeedLevel {
  const numeric = Math.round(numberValue(value, fallback))
  return isSpeedLevel(numeric) ? numeric : fallback
}

function isSpeedLevel(value: number): value is BambuSpeedLevel {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function speedPercentForLevel(level: BambuSpeedLevel): number {
  if (level === 1) return 50
  if (level === 3) return 124
  if (level === 4) return 166
  return 100
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function sequenceIdNow(): string {
  return String(Date.now() % 100000000)
}
