import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { BambuWebSocketBridgeClient } from './bambuClient'
import {
  buildPauseCommand,
  buildResumeCommand,
  buildSpeedCommand,
  isPausedState,
  makeDemoSnapshot,
  parseBambuPayload,
} from './bambuProtocol'
import { clearSensitiveSettings, hasMinimumConnectionSettings, loadSettings, saveSettings } from './settings'
import { controlAt, controlCount, renderHudImages, type HudImage } from './hud'
import { setupPhoneUi } from './phoneUi'
import type { AppState, BambuSpeedLevel, PrinterClient, PrinterClientEvent } from './types'
import './style.css'

const MAIN_CONTAINER_ID = 1
const MAIN_CONTAINER_NAME = 'main'
const HUD_IMAGE_IDS = [2, 3, 4, 5] as const
const DEMO_TICK_MS = 5000

lockNativeScroll()

const state: AppState = {
  view: 'setup',
  selectedControlIndex: 0,
  selectedDetailIndex: 0,
  alertOffset: 0,
  connection: {
    mode: 'setup',
    message: 'Enter printer connection details on the phone.',
  },
  settings: loadSettings(),
}

let bridge: EvenAppBridge | undefined
let pageStarted = false
let client: PrinterClient | undefined
let demoTimer: number | undefined
let demoProgress = 34
let renderInFlight = false
let renderPending = false
let renderLoopPromise: Promise<void> | undefined
let forceFullHudUpdate = true
const hudTileHashes = new Map<number, number>()
let refreshPhoneUi = setupPhoneUi(state, {
  onSaveConnect(settings) {
    state.settings = settings
    saveSettings(settings)
    connectPrinter()
  },
  onDemo() {
    startDemo()
  },
  onDisconnect() {
    stopClient()
    state.connection = { mode: 'setup', message: 'Disconnected.' }
    state.commandNotice = undefined
    renderAll()
  },
  onClearAccessCode() {
    state.settings = clearSensitiveSettings(state.settings)
    state.commandNotice = 'Access code cleared.'
    renderAll()
  },
})

void startGlasses()
if (hasMinimumConnectionSettings(state.settings)) connectPrinter()

async function startGlasses(): Promise<void> {
  try {
    bridge = await waitForEvenAppBridge()
  } catch (error) {
    console.warn('Even bridge unavailable; phone UI only.', error)
    return
  }

  const startupPage = new CreateStartUpPageContainer({
    containerTotalNum: 5,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        paddingLength: 4,
        containerID: MAIN_CONTAINER_ID,
        containerName: MAIN_CONTAINER_NAME,
        content: ' ',
        isEventCapture: 1,
      }),
    ],
    imageObject: hudImageContainers(),
  })

  const result = await bridge.createStartUpPageContainer(startupPage)
  if (result !== 0) {
    console.error('Bambu G2 startup page failed:', result)
    return
  }

  pageStarted = true
  bridge.onEvenHubEvent((event) => {
    switch (eventTypeOf(event)) {
      case OsEventTypeList.CLICK_EVENT:
        handleClick()
        break
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        handleDoubleClick()
        break
      case OsEventTypeList.SCROLL_TOP_EVENT:
        move(-1)
        break
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        move(1)
        break
      default:
        break
    }
  })

  renderAll()
}

function connectPrinter(): void {
  stopDemo()
  stopClient()

  if (!hasMinimumConnectionSettings(state.settings)) {
    state.connection = {
      mode: 'setup',
      message: 'Enter the bridge WebSocket URL from your Linux server.',
    }
    state.view = 'setup'
    renderAll()
    return
  }

  if (!state.settings.bridgeUrl.trim()) {
    state.connection = {
      mode: 'unsupported',
      message: 'Even Hub cannot open raw MQTT/TCP. Configure a whitelisted bridge origin.',
    }
    state.view = 'setup'
    renderAll()
    return
  }

  client = new BambuWebSocketBridgeClient(state.settings, handleClientEvent)
  client.connect()
}

function handleClientEvent(event: PrinterClientEvent): void {
  if (event.type === 'snapshot') {
    const previousAlertCount = state.snapshot?.alerts.length ?? 0
    state.snapshot = event.snapshot
    state.connection = {
      mode: state.connection.mode === 'demo' ? 'demo' : 'connected',
      message: 'Printer status is live.',
      lastSeenAt: Date.now(),
    }
    if (state.view === 'setup') state.view = 'dashboard'
    if (state.settings.alertOnError && event.snapshot.alerts.length > previousAlertCount) {
      state.view = 'alerts'
      state.alertOffset = 0
      state.commandNotice = 'Printer alert surfaced.'
      clearNoticeSoon()
    }
    renderAll()
    return
  }

  if (event.type === 'state') {
    state.connection = event.state
    renderAll()
    return
  }

  state.connection = {
    mode: 'error',
    message: event.message,
    lastSeenAt: Date.now(),
  }
  state.commandNotice = event.message
  clearNoticeSoon()
  renderAll()
}

function startDemo(): void {
  stopClient()
  stopDemo()
  state.connection = {
    mode: 'demo',
    message: 'Demo printer data is active.',
    lastSeenAt: Date.now(),
  }
  state.snapshot = makeDemoSnapshot(demoProgress)
  state.view = 'dashboard'
  state.commandNotice = 'Demo mode'
  clearNoticeSoon()
  demoTimer = window.setInterval(() => {
    demoProgress = demoProgress >= 97 ? 18 : demoProgress + 2
    state.snapshot = makeDemoSnapshot(demoProgress)
    renderAll()
  }, DEMO_TICK_MS)
  renderAll()
}

function stopClient(): void {
  client?.disconnect()
  client = undefined
}

function stopDemo(): void {
  if (demoTimer !== undefined) window.clearInterval(demoTimer)
  demoTimer = undefined
}

function handleClick(): void {
  if (state.view === 'setup') {
    if (state.snapshot) state.view = 'dashboard'
    renderAll()
    return
  }

  if (state.view === 'dashboard') {
    state.view = 'controls'
    renderAll()
    return
  }

  if (state.view === 'controls') {
    sendSelectedControl()
    return
  }

  if (state.view === 'alerts') {
    state.view = 'details'
    renderAll()
    return
  }

  state.view = 'dashboard'
  renderAll()
}

function handleDoubleClick(): void {
  state.view = state.snapshot ? 'dashboard' : 'setup'
  renderAll()
}

function move(delta: number): void {
  if (state.view === 'dashboard') {
    state.view = delta > 0 ? 'controls' : 'alerts'
  } else if (state.view === 'controls') {
    state.selectedControlIndex = wrap(state.selectedControlIndex + delta, controlCount())
  } else if (state.view === 'alerts') {
    const maxOffset = Math.max(0, (state.snapshot?.alerts.length ?? 0) - 1)
    state.alertOffset = clamp(state.alertOffset + delta, 0, maxOffset)
  } else if (state.view === 'details') {
    state.selectedDetailIndex = clamp(state.selectedDetailIndex + delta, 0, 5)
  } else if (state.snapshot) {
    state.view = 'dashboard'
  }
  renderAll()
}

function sendSelectedControl(): void {
  const item = controlAt(state.selectedControlIndex)
  if (!item) return

  try {
    if (item.kind === 'pause') {
      const command = isPausedState(state.snapshot) ? buildResumeCommand() : buildPauseCommand()
      sendCommand(command, isPausedState(state.snapshot) ? 'Resume sent.' : 'Pause sent.')
      return
    }

    if (item.speed) {
      sendCommand(buildSpeedCommand(item.speed), `Speed ${item.speed} sent.`)
    }
  } catch (error) {
    state.commandNotice = error instanceof Error ? error.message : String(error)
    clearNoticeSoon()
    renderAll()
  }
}

function sendCommand(command: ReturnType<typeof buildPauseCommand>, notice: string): void {
  if (state.connection.mode === 'demo') {
    state.snapshot = parseBambuPayload(
      {
        print: command.print.command === 'print_speed' ? { spd_lvl: command.print.param, spd_mag: demoSpeedPercent(command.print.param) } : {},
      },
      state.snapshot,
    )
    if (command.print.command === 'pause' && state.snapshot) state.snapshot.gcodeState = 'PAUSE'
    if (command.print.command === 'resume' && state.snapshot) state.snapshot.gcodeState = 'RUNNING'
    state.commandNotice = `Demo ${notice.toLowerCase()}`
  } else {
    client?.sendCommand(command)
    state.commandNotice = notice
  }
  clearNoticeSoon()
  renderAll()
}

function renderAll(): void {
  refreshPhoneUi()
  renderGlasses()
}

function renderGlasses(): Promise<void> {
  if (!pageStarted || !bridge) return Promise.resolve()
  renderPending = true
  if (!renderLoopPromise) renderLoopPromise = pumpRender()
  return renderLoopPromise
}

async function pumpRender(): Promise<void> {
  if (renderInFlight || !bridge) return
  renderInFlight = true
  try {
    while (renderPending) {
      renderPending = false
      await updateHudImages()
    }
  } catch (error) {
    console.error('Bambu G2 render failed:', error)
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: MAIN_CONTAINER_ID,
        containerName: MAIN_CONTAINER_NAME,
        content: `Bambu G2\n${error instanceof Error ? error.message : String(error)}`,
      }),
    )
  } finally {
    renderInFlight = false
    renderLoopPromise = undefined
    if (renderPending) void renderGlasses()
  }
}

async function updateHudImages(): Promise<void> {
  if (!bridge) return
  const images = renderHudImages(state)
  const changed: Array<{ image: HudImage; hash: number }> = []

  for (const image of images) {
    const hash = imageDataHash(image.imageData)
    if (!forceFullHudUpdate && hudTileHashes.get(image.containerID) === hash) continue
    changed.push({ image, hash })
  }

  for (const { image, hash } of changed) {
    const result = await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: image.containerID,
        containerName: image.containerName,
        imageData: image.imageData,
      }),
    )
    if (String(result) === 'success') hudTileHashes.set(image.containerID, hash)
  }

  forceFullHudUpdate = false
}

function hudImageContainers(): ImageContainerProperty[] {
  const positions = [
    { xPosition: 0, yPosition: 0 },
    { xPosition: 288, yPosition: 0 },
    { xPosition: 0, yPosition: 144 },
    { xPosition: 288, yPosition: 144 },
  ]

  return positions.map(
    (position, index) =>
      new ImageContainerProperty({
        ...position,
        width: 288,
        height: 144,
        containerID: HUD_IMAGE_IDS[index],
        containerName: `hud-${index}`,
      }),
  )
}

type HubEvent = Parameters<Parameters<EvenAppBridge['onEvenHubEvent']>[0]>[0]

function eventTypeOf(event: HubEvent): OsEventTypeList | undefined {
  const eventObject = event.textEvent ?? event.listEvent ?? event.sysEvent
  const raw = eventObject?.eventType ?? event.jsonData?.eventType ?? event.jsonData?.Event_Type
  const normalized = OsEventTypeList.fromJson(raw)
  if (normalized !== undefined) return normalized
  return eventObject ? OsEventTypeList.CLICK_EVENT : undefined
}

function lockNativeScroll(): void {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'

  const preventScroll = (event: Event) => event.preventDefault()
  const resetScroll = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
  }

  window.addEventListener('wheel', preventScroll, { passive: false })
  window.addEventListener('touchmove', preventScroll, { passive: false })
  document.addEventListener('scroll', resetScroll, { passive: true, capture: true })
  window.addEventListener('scroll', resetScroll, { passive: true })
}

function imageDataHash(values: readonly number[]): number {
  let hash = 2166136261
  for (let i = 0; i < values.length; i += 1) {
    hash ^= values[i] ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clearNoticeSoon(): void {
  window.setTimeout(() => {
    state.commandNotice = undefined
    renderAll()
  }, 2600)
}

function wrap(value: number, length: number): number {
  if (length <= 0) return 0
  return ((value % length) + length) % length
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function demoSpeedPercent(value: string | undefined): number {
  if (value === '1') return 50
  if (value === '3') return 124
  if (value === '4') return 166
  return 100
}
