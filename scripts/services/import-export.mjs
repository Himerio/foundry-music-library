import { MODULE_ID, EXPORT_SCHEMA_VERSION, SETTING_KEYS } from '../constants.mjs'
import { getMusicRoot } from './paths.mjs'
import { getTrackIndex, scanMusicLibrary } from './index-service.mjs'
import * as playlistStore from './playlist-store.mjs'
import { syncAllModulePlaylists } from './foundry-sync.mjs'

export function buildExportBundle() {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    moduleVersion: game.modules.get(MODULE_ID)?.version ?? '0.1.0',
    settings: {
      musicRoot: getMusicRoot()
    },
    tracks: getTrackIndex(),
    playlists: playlistStore.getPlaylists()
  }
}

export function downloadExportJson() {
  const bundle = buildExportBundle()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `music-library-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function validatePathsAgainstIndex(tracks) {
  const index = getTrackIndex()
  const missing = []
  for (const path of Object.keys(tracks)) {
    if (!index[path] || index[path].missing) missing.push(path)
  }
  return missing
}

/**
 * @param {object} bundle
 * @param {'merge'|'replace'|'metadata-only'|'playlists-only'} mode
 */
export async function importBundle(bundle, mode) {
  if (!bundle || bundle.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error('Invalid or unsupported export schema')
  }

  const warnings = []

  if (mode === 'replace') {
    await game.settings.set(MODULE_ID, SETTING_KEYS.TRACK_INDEX, {})
    await game.settings.set(MODULE_ID, SETTING_KEYS.PLAYLISTS, [])
  }

  if (mode !== 'playlists-only' && bundle.tracks) {
    const current = mode === 'replace' ? {} : getTrackIndex()
    const merged = foundry.utils.mergeObject(current, bundle.tracks, { inplace: false })
    await game.settings.set(MODULE_ID, SETTING_KEYS.TRACK_INDEX, merged)
    const missing = validatePathsAgainstIndex(bundle.tracks)
    if (missing.length) warnings.push({ type: 'missing', paths: missing })
  }

  if (mode !== 'metadata-only' && bundle.playlists) {
    if (mode === 'replace' || mode === 'playlists-only') {
      await game.settings.set(MODULE_ID, SETTING_KEYS.PLAYLISTS, foundry.utils.deepClone(bundle.playlists))
    } else {
      const existing = playlistStore.getPlaylists()
      const byId = new Map(existing.map((p) => [p.id, p]))
      for (const pl of bundle.playlists) {
        if (byId.has(pl.id)) {
          byId.set(pl.id, foundry.utils.mergeObject(byId.get(pl.id), pl, { inplace: false }))
        } else {
          byId.set(pl.id, foundry.utils.deepClone(pl))
        }
      }
      await game.settings.set(MODULE_ID, SETTING_KEYS.PLAYLISTS, [...byId.values()])
    }
  }

  if (bundle.settings?.musicRoot && mode !== 'metadata-only') {
    await game.settings.set(MODULE_ID, SETTING_KEYS.MUSIC_ROOT, bundle.settings.musicRoot)
  }

  await scanMusicLibrary({ forceMetadata: false })
  await syncAllModulePlaylists()

  return { warnings }
}

export async function pickAndImport(mode) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.style.display = 'none'
  document.body.appendChild(input)

  return new Promise((resolve, reject) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) {
        resolve(null)
        return
      }
      try {
        const text = await file.text()
        const bundle = JSON.parse(text)
        const result = await importBundle(bundle, mode)
        resolve(result)
      } catch (e) {
        reject(e)
      }
    })
    input.click()
  })
}
