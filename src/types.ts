export type BambuSpeedLevel = 1 | 2 | 3 | 4

export type PrinterSettings = {
  printerHost: string
  printerPort: number
  serialNumber: string
  accessCode: string
  bridgeUrl: string
  alertOnError: boolean
}

export type ConnectionMode = 'setup' | 'connecting' | 'connected' | 'demo' | 'unsupported' | 'error'

export type ConnectionState = {
  mode: ConnectionMode
  message: string
  lastSeenAt?: number
}

export type BambuRawPrintReport = Record<string, unknown> & {
  command?: string
}

export type BambuMqttPayload = {
  print?: BambuRawPrintReport
}

export type BambuAlert = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export type PrinterSnapshot = {
  printerName: string
  printName: string
  fileName: string
  gcodeState: string
  progress: number
  remainingMinutes: number
  nozzleTemp: number
  nozzleTarget: number
  bedTemp: number
  bedTarget: number
  chamberTemp?: number
  speedLevel: BambuSpeedLevel
  speedPercent: number
  currentLayer: number
  totalLayers: number
  stage: string
  wifiSignal: string
  printType: string
  alerts: BambuAlert[]
  rawPrint: BambuRawPrintReport
  updatedAt: number
}

export type AppView = 'setup' | 'dashboard' | 'controls' | 'alerts' | 'details'

export type AppState = {
  view: AppView
  selectedControlIndex: number
  selectedDetailIndex: number
  alertOffset: number
  connection: ConnectionState
  settings: PrinterSettings
  snapshot?: PrinterSnapshot
  commandNotice?: string
}

export type BambuCommandPayload = {
  print: {
    sequence_id: string
    command: 'pause' | 'resume' | 'print_speed'
    param?: string
  }
}

export type PrinterClientEvent =
  | {
      type: 'snapshot'
      snapshot: PrinterSnapshot
    }
  | {
      type: 'state'
      state: ConnectionState
    }
  | {
      type: 'error'
      message: string
    }

export type PrinterClient = {
  connect(): void
  disconnect(): void
  sendCommand(command: BambuCommandPayload): void
}
