import { isPausedState, speedLabel } from './bambuProtocol'
import type { AppState, BambuSpeedLevel } from './types'

export type HudImage = {
  containerID: number
  containerName: string
  width: number
  height: number
  imageData: number[]
}

const HUD_WIDTH = 576
const HUD_HEIGHT = 288
const TILE_WIDTH = 288
const TILE_HEIGHT = 144
const FONT_FAMILY = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, Helvetica, sans-serif'

const COLORS = {
  bg: '#000000',
  panel: '#050505',
  border: '#ffffff',
  text: '#ffffff',
  muted: '#aaaaaa',
  faint: '#565656',
  track: '#2d2d2d',
  dark: '#000000',
}

let canvas: HTMLCanvasElement | undefined
let context: CanvasRenderingContext2D | undefined

const CONTROL_ITEMS: Array<{ label: string; kind: 'pause' | 'speed'; speed?: BambuSpeedLevel }> = [
  { label: 'Pause / Resume', kind: 'pause' },
  { label: 'Silent 50%', kind: 'speed', speed: 1 },
  { label: 'Standard 100%', kind: 'speed', speed: 2 },
  { label: 'Sport 124%', kind: 'speed', speed: 3 },
  { label: 'Ludicrous 166%', kind: 'speed', speed: 4 },
]

export function renderHudImages(state: AppState, tileIds?: ReadonlySet<number>): HudImage[] {
  const target = canvas ?? document.createElement('canvas')
  canvas = target
  if (target.width !== HUD_WIDTH) target.width = HUD_WIDTH
  if (target.height !== HUD_HEIGHT) target.height = HUD_HEIGHT

  const ctx = context ?? target.getContext('2d', { willReadFrequently: true }) ?? undefined
  context = ctx
  if (!ctx) return []

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT)
  ctx.textBaseline = 'top'
  configureTextRendering(ctx)

  if (state.view === 'setup') drawSetup(ctx, state)
  if (state.view === 'dashboard') drawDashboard(ctx, state)
  if (state.view === 'controls') drawControls(ctx, state)
  if (state.view === 'alerts') drawAlerts(ctx, state)
  if (state.view === 'details') drawDetails(ctx, state)

  drawNotice(ctx, state)
  return splitCanvas(ctx, tileIds)
}

export function controlAt(index: number): (typeof CONTROL_ITEMS)[number] | undefined {
  return CONTROL_ITEMS[index]
}

export function controlCount(): number {
  return CONTROL_ITEMS.length
}

function drawSetup(ctx: CanvasRenderingContext2D, state: AppState): void {
  drawPanel(ctx, 10, 8, 556, 238)
  drawText(ctx, 'BAMBU G2', 28, 24, 28, COLORS.text, '700')
  drawText(ctx, state.connection.mode === 'demo' ? 'Demo printer active' : 'Configure printer on phone', 28, 66, 17, COLORS.text, '600')
  drawText(ctx, fit(state.connection.message, 62), 28, 100, 13, COLORS.muted)
  drawText(ctx, 'Install the Linux bridge, then enter its WebSocket URL.', 28, 128, 12, COLORS.muted)
  drawText(ctx, 'Use Demo on the phone to preview without a printer.', 28, 150, 12, COLORS.muted)
  drawFooter(ctx, 'Setup', 'Use phone to connect or demo')
}

function drawDashboard(ctx: CanvasRenderingContext2D, state: AppState): void {
  const snapshot = state.snapshot
  if (!snapshot) {
    drawSetup(ctx, state)
    return
  }

  drawPanel(ctx, 10, 8, 556, 64)
  drawText(ctx, fit(snapshot.printName, 34), 26, 20, 22, COLORS.text, '700')
  drawText(ctx, snapshot.gcodeState, 420, 18, 15, COLORS.text, '700')
  drawText(ctx, relativeTime(snapshot.updatedAt), 420, 42, 11, COLORS.muted)

  drawPanel(ctx, 10, 84, 270, 110)
  drawText(ctx, 'PROGRESS', 26, 98, 12, COLORS.muted, '700')
  drawText(ctx, `${snapshot.progress}%`, 26, 120, 36, COLORS.text, '700')
  drawProgress(ctx, 112, 136, 142, 16, snapshot.progress)
  drawText(ctx, `${formatMinutes(snapshot.remainingMinutes)} left`, 28, 166, 14, COLORS.text, '600')

  drawPanel(ctx, 296, 84, 270, 110)
  drawTemp(ctx, 314, 100, 'Nozzle', snapshot.nozzleTemp, snapshot.nozzleTarget)
  drawTemp(ctx, 314, 144, 'Bed', snapshot.bedTemp, snapshot.bedTarget)
  drawText(ctx, snapshot.chamberTemp === undefined ? 'Chamber --' : `Chamber ${Math.round(snapshot.chamberTemp)} C`, 452, 114, 12, COLORS.muted)
  drawText(ctx, `${speedLabel(snapshot.speedLevel)} ${snapshot.speedPercent}%`, 452, 144, 13, COLORS.text, '700')

  drawPanel(ctx, 10, 206, 556, 40)
  drawText(ctx, snapshot.totalLayers ? `Layer ${snapshot.currentLayer}/${snapshot.totalLayers}` : 'Layer --', 26, 218, 13, COLORS.text, '700')
  drawText(ctx, `Stage ${fit(snapshot.stage, 22)}`, 164, 218, 13, COLORS.muted)
  drawText(ctx, `${snapshot.alerts.length} alerts`, 424, 218, 13, snapshot.alerts.length ? COLORS.text : COLORS.muted, '700')

  drawFooter(ctx, `${snapshot.printerName} ${snapshot.wifiSignal}`, 'Swipe view   Click controls')
}

function drawControls(ctx: CanvasRenderingContext2D, state: AppState): void {
  const snapshot = state.snapshot
  drawPanel(ctx, 10, 8, 556, 238)
  drawText(ctx, 'CONTROLS', 26, 20, 20, COLORS.text, '700')
  drawText(ctx, snapshot ? fit(snapshot.printName, 34) : 'No printer status yet', 170, 24, 14, COLORS.muted)

  CONTROL_ITEMS.forEach((item, index) => {
    const y = 62 + index * 34
    const selected = state.selectedControlIndex === index
    drawActionRow(ctx, 28, y, 520, item.label, selected)
    if (item.kind === 'pause') {
      drawText(ctx, isPausedState(snapshot) ? 'Resume print' : 'Pause print', 352, y + 9, 12, selected ? COLORS.dark : COLORS.muted, '600')
    } else if (item.speed === snapshot?.speedLevel) {
      drawText(ctx, 'Current', 386, y + 9, 12, selected ? COLORS.dark : COLORS.text, '700')
    }
  })

  drawFooter(ctx, `Action ${state.selectedControlIndex + 1}/${CONTROL_ITEMS.length}`, 'Swipe select   Click send   Double back')
}

function drawAlerts(ctx: CanvasRenderingContext2D, state: AppState): void {
  const alerts = state.snapshot?.alerts ?? []
  drawPanel(ctx, 10, 8, 556, 238)
  drawText(ctx, 'ALERTS', 26, 20, 20, COLORS.text, '700')
  drawText(ctx, alerts.length ? `${alerts.length} active` : 'No active alerts', 142, 24, 14, alerts.length ? COLORS.text : COLORS.muted, '700')

  if (!alerts.length) {
    drawText(ctx, 'Printer error and HMS messages will surface here.', 28, 80, 15, COLORS.muted)
  } else {
    alerts.slice(state.alertOffset, state.alertOffset + 5).forEach((alert, index) => {
      const y = 62 + index * 34
      drawText(ctx, fit(alert.code, 16), 28, y, 13, COLORS.text, '700')
      drawText(ctx, fit(alert.message, 46), 150, y, 13, COLORS.muted)
    })
  }

  drawFooter(ctx, alerts.length ? `Alert ${state.alertOffset + 1}/${alerts.length}` : 'Alerts', 'Swipe scroll   Double back')
}

function drawDetails(ctx: CanvasRenderingContext2D, state: AppState): void {
  const snapshot = state.snapshot
  drawPanel(ctx, 10, 8, 556, 238)
  drawText(ctx, 'DETAILS', 26, 20, 20, COLORS.text, '700')

  const rows = snapshot
    ? [
        ['File', snapshot.fileName || '--'],
        ['G-code', snapshot.gcodeState],
        ['Type', snapshot.printType],
        ['Stage', snapshot.stage],
        ['Wi-Fi', snapshot.wifiSignal],
        ['Updated', new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
      ]
    : [['Status', state.connection.message]]

  rows.slice(state.selectedDetailIndex, state.selectedDetailIndex + 6).forEach(([label, value], index) => {
    const y = 58 + index * 28
    drawText(ctx, label, 28, y, 12, COLORS.muted, '700')
    drawText(ctx, fit(value, 48), 132, y, 13, COLORS.text)
  })

  drawFooter(ctx, `Row ${Math.min(state.selectedDetailIndex + 1, rows.length)}/${rows.length}`, 'Swipe scroll   Double back')
}

function drawTemp(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, actual: number, target: number): void {
  drawText(ctx, label, x, y, 11, COLORS.muted, '700')
  drawText(ctx, `${Math.round(actual)}`, x, y + 16, 22, COLORS.text, '700')
  drawText(ctx, `/ ${Math.round(target)} C`, x + 46, y + 22, 12, COLORS.muted)
}

function drawNotice(ctx: CanvasRenderingContext2D, state: AppState): void {
  const notice = state.commandNotice
  if (!notice) return
  fillRound(ctx, 158, 252, 260, 24, 5, COLORS.text)
  drawText(ctx, fit(notice, 34), 170, 257, 11, COLORS.dark, '700')
}

function drawFooter(ctx: CanvasRenderingContext2D, left: string, right: string): void {
  drawText(ctx, fit(left, 34), 16, 262, 12, COLORS.text, '700')
  drawText(ctx, fit(right, 44), 270, 262, 11, COLORS.muted)
}

function drawActionRow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, selected: boolean): void {
  fillRound(ctx, x, y, width, 28, 6, selected ? COLORS.text : COLORS.panel)
  ctx.strokeStyle = selected ? COLORS.text : COLORS.faint
  strokeRound(ctx, x, y, width, 28, 6)
  drawText(ctx, label, x + 14, y + 7, 13, selected ? COLORS.dark : COLORS.text, '700')
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  fillRound(ctx, x, y, width, height, 8, COLORS.panel)
  ctx.strokeStyle = COLORS.border
  strokeRound(ctx, x, y, width, height, 8)
}

function drawProgress(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, value: number): void {
  fillRound(ctx, x, y, width, height, 5, COLORS.track)
  fillRound(ctx, x, y, Math.max(5, Math.round((width * value) / 100)), height, 5, COLORS.text)
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = '400',
): void {
  ctx.fillStyle = color
  ctx.font = `${readableFontWeight(weight)} ${size}px ${FONT_FAMILY}`
  ctx.fillText(text, Math.round(x), Math.round(y))
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  roundedPath(ctx, x, y, width, height, radius)
  ctx.fillStyle = color
  ctx.fill()
}

function strokeRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  roundedPath(ctx, x, y, width, height, radius)
  ctx.stroke()
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function splitCanvas(ctx: CanvasRenderingContext2D, tileIds?: ReadonlySet<number>): HudImage[] {
  const specs = [
    { containerID: 2, containerName: 'hud-nw', x: 0, y: 0 },
    { containerID: 3, containerName: 'hud-ne', x: TILE_WIDTH, y: 0 },
    { containerID: 4, containerName: 'hud-sw', x: 0, y: TILE_HEIGHT },
    { containerID: 5, containerName: 'hud-se', x: TILE_WIDTH, y: TILE_HEIGHT },
  ]

  return specs
    .filter((spec) => !tileIds || tileIds.has(spec.containerID))
    .map((spec) => ({
      containerID: spec.containerID,
      containerName: spec.containerName,
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      imageData: tileGray(ctx, spec.x, spec.y, TILE_WIDTH, TILE_HEIGHT),
    }))
}

function tileGray(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): number[] {
  const rgba = ctx.getImageData(x, y, width, height).data
  const gray = new Array<number>(width * height)
  let pixel = 0
  for (let i = 0; i < rgba.length; i += 4) {
    const value = Math.round(rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722)
    gray[pixel] = value < 24 ? 0 : Math.min(255, Math.round(255 * Math.pow(value / 255, 0.9)))
    pixel += 1
  }
  return gray
}

function configureTextRendering(ctx: CanvasRenderingContext2D): void {
  const textContext = ctx as CanvasRenderingContext2D & {
    fontKerning?: CanvasFontKerning
    textRendering?: CanvasTextRendering
  }
  textContext.fontKerning = 'normal'
  textContext.textRendering = 'optimizeLegibility'
}

function readableFontWeight(weight: string): string {
  const numeric = Number(weight)
  if (!Number.isFinite(numeric)) return weight
  return numeric >= 700 ? '600' : weight
}

function fit(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours <= 0) return `${mins}m`
  return `${hours}h ${String(mins).padStart(2, '0')}m`
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}
