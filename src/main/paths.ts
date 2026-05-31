import electron from 'electron'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { app } = electron

export interface AppPaths {
  root: string
  database: string
  media: string
  profile: string
}

export function configureAppPaths(): AppPaths {
  const testRoot = !app.isPackaged ? process.env.REACTION_CLIPBOARD_DATA_DIR : undefined
  const root = path.resolve(testRoot || defaultRoot())
  const profile = path.join(root, 'electron-profile')
  const paths = { root, database: path.join(root, 'database.sqlite'), media: path.join(root, 'media'), profile }
  for (const folder of [root, profile, paths.media, path.join(profile, 'logs'), path.join(profile, 'crash-dumps')]) {
    mkdirSync(folder, { recursive: true })
  }
  app.setPath('userData', profile)
  app.setPath('sessionData', path.join(profile, 'session'))
  app.setPath('crashDumps', path.join(profile, 'crash-dumps'))
  app.setAppLogsPath(path.join(profile, 'logs'))
  return paths
}

function defaultRoot(): string {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Reaction Clipboard')
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Reaction Clipboard')
}
