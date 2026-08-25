import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const shouldQr = process.argv.includes('--qr')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const baseUrl = process.env.BAMBU_G2_HOST_URL ?? 'https://example.com/bambu-g2/index.html'
const separator = baseUrl.includes('?') ? '&' : '?'
const url = `${baseUrl}${separator}v=${encodeURIComponent(`${pkg.version}-${Date.now()}`)}`

if (!shouldQr) {
  console.log(`Hosted Plugin Loader URL: ${url}`)
  process.exit(0)
}

console.log(`Generating hosted Even Hub QR for ${url}`)
const result = spawnSync('node_modules/.bin/evenhub', ['qr', '--url', url], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
