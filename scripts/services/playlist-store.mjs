import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'
import { createPlaylist } from '../data/schemas.mjs'

export function getPlaylists() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_KEYS.PLAYLISTS) ?? [])
}

async function savePlaylists(playlists) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.PLAYLISTS, playlists)
}

export function getPlaylistById(id) {
  return getPlaylists().find((p) => p.id === id) ?? null
}

export async function createModulePlaylist(name) {
  const playlists = getPlaylists()
  const playlist = createPlaylist(name.trim() || 'Playlist')
  playlists.push(playlist)
  await savePlaylists(playlists)
  return playlist
}

export async function renameModulePlaylist(id, name) {
  const playlists = getPlaylists()
  const p = playlists.find((pl) => pl.id === id)
  if (!p) return null
  p.name = name.trim() || p.name
  p.updatedAt = new Date().toISOString()
  await savePlaylists(playlists)
  return p
}

export async function deleteModulePlaylist(id) {
  const playlists = getPlaylists().filter((p) => p.id !== id)
  await savePlaylists(playlists)
}

export async function duplicateModulePlaylist(id) {
  const source = getPlaylistById(id)
  if (!source) return null
  const copy = createPlaylist(`${source.name} (copy)`)
  copy.trackPaths = [...source.trackPaths]
  const playlists = getPlaylists()
  playlists.push(copy)
  await savePlaylists(playlists)
  return copy
}

export async function setPlaylistTracks(id, trackPaths) {
  const playlists = getPlaylists()
  const p = playlists.find((pl) => pl.id === id)
  if (!p) return null
  p.trackPaths = [...trackPaths]
  p.updatedAt = new Date().toISOString()
  await savePlaylists(playlists)
  return p
}

/**
 * @param {string} id
 * @param {string} trackPath
 * @param {number} [index] Insert index; omit to append
 */
export async function insertTrackIntoPlaylist(id, trackPath, index) {
  const p = getPlaylistById(id)
  if (!p || !trackPath) return p
  if (p.trackPaths.includes(trackPath)) return p
  const paths = [...p.trackPaths]
  if (Number.isInteger(index) && index >= 0 && index <= paths.length) {
    paths.splice(index, 0, trackPath)
  } else {
    paths.push(trackPath)
  }
  return setPlaylistTracks(id, paths)
}

export async function addTrackToPlaylist(id, trackPath) {
  return insertTrackIntoPlaylist(id, trackPath)
}

export async function removeTrackFromPlaylist(id, trackPath) {
  const p = getPlaylistById(id)
  if (!p) return null
  return setPlaylistTracks(id, p.trackPaths.filter((t) => t !== trackPath))
}

/**
 * @param {string} id
 * @param {number} fromIndex
 * @param {number} toIndex Destination index after the move
 */
export async function reorderPlaylistTracks(id, fromIndex, toIndex) {
  const playlists = getPlaylists()
  const p = playlists.find((pl) => pl.id === id)
  if (!p) return null
  const paths = [...p.trackPaths]
  if (fromIndex < 0 || fromIndex >= paths.length) return null
  if (toIndex < 0 || toIndex >= paths.length) return null
  if (fromIndex === toIndex) return p
  const [item] = paths.splice(fromIndex, 1)
  paths.splice(toIndex, 0, item)
  p.trackPaths = paths
  p.updatedAt = new Date().toISOString()
  await savePlaylists(playlists)
  return p
}

export async function setFoundryPlaylistId(modulePlaylistId, foundryPlaylistId) {
  const playlists = getPlaylists()
  const p = playlists.find((pl) => pl.id === modulePlaylistId)
  if (!p) return
  p.foundryPlaylistId = foundryPlaylistId
  p.updatedAt = new Date().toISOString()
  await savePlaylists(playlists)
}
