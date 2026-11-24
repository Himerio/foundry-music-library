import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'

export function getMusicRoot() {
  const root = game.settings.get(MODULE_ID, SETTING_KEYS.MUSIC_ROOT)
  return (root || 'music').replace(/^\/+|\/+$/g, '')
}

export function normalizeTrackPath(filename) {
  const root = getMusicRoot()
  const clean = filename.replace(/^\/+/, '')
  if (clean.includes('/')) {
    const base = clean.split('/').pop()
    return `${root}/${base}`
  }
  return `${root}/${clean}`
}

export function toFoundryMediaPath(trackPath) {
  return trackPath.startsWith('/') ? trackPath.slice(1) : trackPath
}

export function getTrackUrl(trackPath) {
  return foundry.utils.getRoute(toFoundryMediaPath(trackPath))
}

export function isMp3Filename(name) {
  return /\.mp3$/i.test(name)
}
