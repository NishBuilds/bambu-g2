import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

const port = Number(process.env.PORT ?? 5175)
const shouldQr = process.argv.includes('--qr')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const cacheBust = `v=${encodeURIComponent(`${pkg.version}-${Date.now()}`)}`
const candidates = []

for (const [name, entries] of Object.entries(networkInterfaces())) {
  for (const entry of entries ?? []) {
    if (entry.family !== 'IPv4' || entry.internal) continue
    candidates.push({ name, address: entry.address })
  }
}

if (!candidates.length) {
  console.error('No non-internal IPv4 address found.')
  process.exit(1)
}

console.log('Candidate dev URLs:')
for (const candidate of candidates) {
  console.log(`  ${candidate.name}: http://${candidate.address}:${port}`)
}

const chosen = candidates[0]
const url = `http://${chosen.address}:${port}/?${cacheBust}`

if (!shouldQr) {
  console.log(`\nRecommended QR URL: ${url}`)
  process.exit(0)
}

console.log(`\nGenerating Even Hub QR for ${url}`)
const result = spawnSync('node_modules/.bin/evenhub', ['qr', '--url', url], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
