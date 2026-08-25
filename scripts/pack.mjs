import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npm', ['run', 'build'])

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const sdkPkg = JSON.parse(
  readFileSync(new URL('../node_modules/@evenrealities/even_hub_sdk/package.json', import.meta.url), 'utf8'),
)
const output = `bambu-g2-v${pkg.version}.ehpk`

run('node_modules/.bin/evenhub', ['pack', 'app.json', 'dist', '-o', output, '--sdk-ver', sdkPkg.version])
console.log(`Packed ${output} with SDK ${sdkPkg.version}`)
