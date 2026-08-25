import { parseBambuPayload } from './bambuProtocol'
import type {
  BambuCommandPayload,
  ConnectionState,
  PrinterClient,
  PrinterClientEvent,
  PrinterSettings,
  PrinterSnapshot,
} from './types'

type Emit = (event: PrinterClientEvent) => void

export class BambuWebSocketBridgeClient implements PrinterClient {
  private socket?: WebSocket
  private snapshot?: PrinterSnapshot

  constructor(
    private readonly settings: PrinterSettings,
    private readonly emit: Emit,
  ) {}

  connect(): void {
    if (!this.settings.bridgeUrl) {
      this.emitState('unsupported', 'No bridge URL is configured.')
      return
    }

    this.disconnect()
    this.emitState('connecting', 'Connecting to local bridge...')
    const socket = new WebSocket(this.settings.bridgeUrl)
    this.socket = socket

    socket.addEventListener('open', () => {
      this.emitState('connected', 'Bridge connected. Waiting for printer status...')
      const printer =
        this.settings.printerHost && this.settings.serialNumber && this.settings.accessCode
          ? {
              host: this.settings.printerHost,
              port: this.settings.printerPort,
              serial: this.settings.serialNumber,
              username: 'bblp',
              accessCode: this.settings.accessCode,
              reportTopic: `device/${this.settings.serialNumber}/report`,
              requestTopic: `device/${this.settings.serialNumber}/request`,
            }
          : undefined

      socket.send(JSON.stringify({ type: 'connect', printer }))
    })

    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data)
    })

    socket.addEventListener('close', () => {
      this.emitState('setup', 'Bridge disconnected.')
    })

    socket.addEventListener('error', () => {
      this.emit({
        type: 'error',
        message: 'Bridge connection failed. Check the whitelisted origin and local bridge.',
      })
    })
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = undefined
  }

  sendCommand(command: BambuCommandPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.emit({
        type: 'error',
        message: 'No bridge connection is available for printer commands.',
      })
      return
    }

    this.socket.send(
      JSON.stringify({
        type: 'command',
        topic: `device/${this.settings.serialNumber}/request`,
        payload: command,
      }),
    )
  }

  private handleMessage(data: unknown): void {
    const parsed = parseBridgeMessage(data)
    if (!parsed) return

    if (parsed.type === 'status' || parsed.type === 'message') {
      this.snapshot = parseBambuPayload(parsed.payload, this.snapshot)
      if (this.snapshot) this.emit({ type: 'snapshot', snapshot: this.snapshot })
      return
    }

    if (parsed.type === 'state') {
      this.emitState(parsed.mode ?? 'connected', parsed.message ?? 'Bridge state changed.')
      return
    }

    if (parsed.type === 'error') {
      this.emit({ type: 'error', message: parsed.message ?? 'Bridge reported an error.' })
    }
  }

  private emitState(mode: ConnectionState['mode'], message: string): void {
    this.emit({
      type: 'state',
      state: {
        mode,
        message,
        lastSeenAt: Date.now(),
      },
    })
  }
}

type BridgeMessage = {
  type?: string
  mode?: ConnectionState['mode']
  message?: string
  payload?: unknown
}

function parseBridgeMessage(data: unknown): BridgeMessage | undefined {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as BridgeMessage
    } catch {
      return undefined
    }
  }

  if (data && typeof data === 'object') return data as BridgeMessage
  return undefined
}
