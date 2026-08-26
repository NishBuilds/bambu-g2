import { isPausedState, speedLabel } from './bambuProtocol'
import type { AppState, PrinterSettings } from './types'

export type PhoneUiActions = {
  onSaveConnect(settings: PrinterSettings): void
  onDemo(): void
  onDisconnect(): void
  onClearAccessCode(): void
}

const GITHUB_URL = 'https://github.com/NishBuilds/bambu-g2'

export function setupPhoneUi(state: AppState, actions: PhoneUiActions): () => void {
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) return () => undefined

  let lastRenderKey = ''

  const render = () => {
    const key = JSON.stringify({
      settings: maskedSettings(state.settings),
      connection: state.connection,
      snapshot: state.snapshot
        ? {
            printName: state.snapshot.printName,
            progress: state.snapshot.progress,
            state: state.snapshot.gcodeState,
            remaining: state.snapshot.remainingMinutes,
            alerts: state.snapshot.alerts.length,
            updatedAt: Math.floor(state.snapshot.updatedAt / 1000),
          }
        : undefined,
      notice: state.commandNotice,
    })
    if (key === lastRenderKey) return
    lastRenderKey = key

    root.innerHTML = `
      <main class="shell">
        <section class="panel settings-panel">
          <div class="title-row">
            <div>
              <p class="eyebrow">Printer HUD</p>
              <h1>Bambu G2</h1>
            </div>
            <span class="status-pill" data-mode="${state.connection.mode}">${labelForMode(state.connection.mode)}</span>
          </div>

          <div class="setup-note">
            <strong>Get Connected</strong>
            <span>Install the bridge on Linux or Raspberry Pi, then paste the printed Bridge URL below.</span>
            <a href="${GITHUB_URL}" target="_blank" rel="noreferrer">Open install guide</a>
          </div>

          <form class="settings-form">
            <label>
              <span>Bridge WebSocket URL</span>
              <input name="bridgeUrl" autocomplete="off" placeholder="ws://your-server:8983/ws" />
            </label>
            <details>
              <summary>Optional printer override</summary>
              <div class="advanced-grid">
            <label>
              <span>Printer IP or host</span>
              <input name="printerHost" autocomplete="off" placeholder="192.168.1.42" />
            </label>
            <label>
              <span>Printer serial</span>
              <input name="serialNumber" autocomplete="off" placeholder="00M00A000000000" />
            </label>
            <label>
              <span>LAN access code</span>
              <input name="accessCode" type="password" autocomplete="off" placeholder="Required for Bambu MQTT" />
            </label>
              </div>
            </details>
            <label class="check-row">
              <input name="alertOnError" type="checkbox" />
              <span>Surface printer alerts on the glasses</span>
            </label>
            <div class="buttons">
              <button type="submit">Save and Connect</button>
              <button type="button" data-action="demo">Demo</button>
              <button type="button" data-action="disconnect">Disconnect</button>
              <button type="button" data-action="clear">Clear Code</button>
            </div>
          </form>

          <p class="message"></p>
          <footer class="credit">
            <span>Nishad Neelakandan</span>
            <span>@nishneel</span>
          </footer>
        </section>

        <section class="panel live-panel">
          <div class="live-header">
            <div>
              <p class="eyebrow">Live Status</p>
              <h2></h2>
            </div>
            <strong class="progress-text"></strong>
          </div>
          <div class="progress-track"><span></span></div>
          <dl class="metrics"></dl>
          <div class="alert-list"></div>
        </section>
      </main>
    `

    bindValues(root, state.settings)
    bindLive(root, state)
    bindActions(root, actions)
  }

  render()
  return render
}

function bindValues(root: HTMLElement, settings: PrinterSettings): void {
  setInputValue(root, 'printerHost', settings.printerHost)
  setInputValue(root, 'serialNumber', settings.serialNumber)
  setInputValue(root, 'accessCode', settings.accessCode)
  setInputValue(root, 'bridgeUrl', settings.bridgeUrl)
  const alertInput = root.querySelector<HTMLInputElement>('input[name="alertOnError"]')
  if (alertInput) alertInput.checked = settings.alertOnError
}

function bindLive(root: HTMLElement, state: AppState): void {
  const snapshot = state.snapshot
  const message = root.querySelector<HTMLElement>('.message')
  if (message) message.textContent = state.commandNotice || state.connection.message

  const title = root.querySelector<HTMLElement>('.live-panel h2')
  if (title) title.textContent = snapshot?.printName ?? 'No printer data yet'

  const progressText = root.querySelector<HTMLElement>('.progress-text')
  if (progressText) progressText.textContent = snapshot ? `${snapshot.progress}%` : '--'

  const progressBar = root.querySelector<HTMLElement>('.progress-track span')
  if (progressBar) progressBar.style.width = `${snapshot?.progress ?? 0}%`

  const metrics = root.querySelector<HTMLElement>('.metrics')
  if (metrics) {
    metrics.innerHTML = ''
    for (const [label, value] of metricRows(state)) {
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.textContent = label
      dd.textContent = value
      metrics.append(dt, dd)
    }
  }

  const alerts = root.querySelector<HTMLElement>('.alert-list')
  if (!alerts) return
  alerts.innerHTML = ''
  if (!snapshot?.alerts.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No active printer alerts.'
    alerts.append(empty)
    return
  }

  for (const alert of snapshot.alerts.slice(0, 3)) {
    const item = document.createElement('p')
    item.className = 'alert-row'
    item.textContent = `${alert.code}: ${alert.message}`
    alerts.append(item)
  }
}

function bindActions(root: HTMLElement, actions: PhoneUiActions): void {
  const form = root.querySelector<HTMLFormElement>('.settings-form')
  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    actions.onSaveConnect(readForm(form))
  })

  root.querySelector<HTMLButtonElement>('[data-action="demo"]')?.addEventListener('click', actions.onDemo)
  root.querySelector<HTMLButtonElement>('[data-action="disconnect"]')?.addEventListener('click', actions.onDisconnect)
  root.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener('click', actions.onClearAccessCode)
}

function readForm(form: HTMLFormElement): PrinterSettings {
  const data = new FormData(form)
  return {
    printerHost: String(data.get('printerHost') ?? ''),
    printerPort: 8883,
    serialNumber: String(data.get('serialNumber') ?? ''),
    accessCode: String(data.get('accessCode') ?? ''),
    bridgeUrl: String(data.get('bridgeUrl') ?? ''),
    alertOnError: data.get('alertOnError') === 'on',
  }
}

function setInputValue(root: HTMLElement, name: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (input) input.value = value
}

function metricRows(state: AppState): Array<[string, string]> {
  const snapshot = state.snapshot
  if (!snapshot) return [['Connection', state.connection.message]]
  return [
    ['State', snapshot.gcodeState],
    ['Time left', formatMinutes(snapshot.remainingMinutes)],
    ['Nozzle', `${roundTemp(snapshot.nozzleTemp)} / ${roundTemp(snapshot.nozzleTarget)} C`],
    ['Bed', `${roundTemp(snapshot.bedTemp)} / ${roundTemp(snapshot.bedTarget)} C`],
    ['Speed', `${speedLabel(snapshot.speedLevel)} ${snapshot.speedPercent}%`],
    ['Layer', snapshot.totalLayers ? `${snapshot.currentLayer} / ${snapshot.totalLayers}` : '--'],
    ['Action', isPausedState(snapshot) ? 'Resume available' : 'Pause available'],
  ]
}

function labelForMode(mode: AppState['connection']['mode']): string {
  if (mode === 'connected') return 'Connected'
  if (mode === 'connecting') return 'Connecting'
  if (mode === 'demo') return 'Demo'
  if (mode === 'error') return 'Error'
  if (mode === 'unsupported') return 'Needs Bridge'
  return 'Setup'
}

function maskedSettings(settings: PrinterSettings): PrinterSettings {
  return {
    ...settings,
    accessCode: settings.accessCode ? 'saved' : '',
  }
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours <= 0) return `${mins}m`
  return `${hours}h ${String(mins).padStart(2, '0')}m`
}

function roundTemp(value: number): string {
  return String(Math.round(value))
}
