const { createPackage } = require('@electron/asar')
const { cpSync, copyFileSync, mkdirSync, renameSync, rmSync } = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const unpacked = path.join(dist, 'win-unpacked')
const resources = path.join(unpacked, 'resources')
const staging = path.join(dist, 'windows-app-staging')

for (const target of [unpacked, staging]) removeGeneratedDirectory(target)
mkdirSync(staging, { recursive: true })
cpSync(path.join(root, 'node_modules', 'electron', 'dist'), unpacked, { recursive: true })
cpSync(path.join(root, 'out'), path.join(staging, 'out'), { recursive: true })
copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'))
cpSync(path.join(root, 'node_modules', 'zod'), path.join(staging, 'node_modules', 'zod'), { recursive: true })
copyFileSync(path.join(root, 'build', 'icon.ico'), path.join(resources, 'icon.ico'))
renameSync(path.join(unpacked, 'electron.exe'), path.join(unpacked, 'Reaction Clipboard.exe'))
rmSync(path.join(resources, 'default_app.asar'), { force: true })

createPackage(staging, path.join(resources, 'app.asar'))
  .finally(() => removeGeneratedDirectory(staging))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

function removeGeneratedDirectory(target) {
  const resolved = path.resolve(target)
  const relative = path.relative(dist, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside generated dist output: ${resolved}`)
  }
  rmSync(resolved, { recursive: true, force: true })
}
