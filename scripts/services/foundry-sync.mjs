import {
  FLAG_MODULE_PLAYLIST_ID,
  MODULE_ID,
  SETTING_KEYS
} from '../constants.mjs'
import { getTrack } from './index-service.mjs'
import * as playlistStore from './playlist-store.mjs'
import { formatFoundrySoundName, getTrackTitle } from './track-display.mjs'
import { toFoundryMediaPath } from './paths.mjs'

export function getSyncPrefix() {
  return game.settings.get(MODULE_ID, SETTING_KEYS.SYNC_PREFIX) || '[Music]'
}

export function getFoundryPlaylistName(moduleName) {
  return `${getSyncPrefix()} ${moduleName}`.trim()
}

function findSyncedPlaylist(modulePlaylist) {
  if (modulePlaylist.foundryPlaylistId) {
    const byId = game.playlists.get(modulePlaylist.foundryPlaylistId)
    if (byId) return byId
  }
  const name = getFoundryPlaylistName(modulePlaylist.name)
  return game.playlists.find((p) => p.name === name)
    ?? game.playlists.find((p) => p.getFlag(MODULE_ID, FLAG_MODULE_PLAYLIST_ID) === modulePlaylist.id)
}

/**
 * Sync one module playlist to a Foundry Playlist document.
 * @param {import('../data/schemas.mjs').ModulePlaylist} modulePlaylist
 */
export async function syncModulePlaylistToFoundry(modulePlaylist) {
  const name = getFoundryPlaylistName(modulePlaylist.name)
  let playlist = findSyncedPlaylist(modulePlaylist)

  if (!playlist) {
    playlist = await Playlist.create({
      name,
      mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
      channel: 'music',
      flags: { [MODULE_ID]: { [FLAG_MODULE_PLAYLIST_ID]: modulePlaylist.id } }
    })
    await playlistStore.setFoundryPlaylistId(modulePlaylist.id, playlist.id)
  } else {
    await playlist.update({
      name,
      flags: { [MODULE_ID]: { [FLAG_MODULE_PLAYLIST_ID]: modulePlaylist.id } }
    })
    if (modulePlaylist.foundryPlaylistId !== playlist.id) {
      await playlistStore.setFoundryPlaylistId(modulePlaylist.id, playlist.id)
    }
  }

  const existingSounds = playlist.sounds.contents
  const desiredPaths = modulePlaylist.trackPaths
  const totalCount = desiredPaths.length
  const toDelete = []
  const toCreate = []
  const toUpdate = []

  const soundByPath = new Map()
  for (const sound of existingSounds) {
    const key = sound.path?.replace(/^\//, '') ?? ''
    soundByPath.set(key, sound)
  }

  desiredPaths.forEach((trackPath, sort) => {
    const mediaPath = toFoundryMediaPath(trackPath)
    const track = getTrack(trackPath)
    const baseTitle = track ? getTrackTitle(track) : trackPath.split('/').pop()
    const soundName = formatFoundrySoundName(sort, totalCount, baseTitle)
    const existing = soundByPath.get(mediaPath)
    if (existing) {
      toUpdate.push({
        _id: existing.id,
        name: soundName,
        path: mediaPath,
        sort: sort * 100
      })
      soundByPath.delete(mediaPath)
    } else {
      toCreate.push({
        name: soundName,
        path: mediaPath,
        repeat: false,
        volume: 0.8,
        sort: sort * 100
      })
    }
  })

  for (const sound of soundByPath.values()) {
    toDelete.push(sound.id)
  }

  if (toDelete.length) {
    await playlist.deleteEmbeddedDocuments('PlaylistSound', toDelete)
  }
  if (toCreate.length) {
    await playlist.createEmbeddedDocuments('PlaylistSound', toCreate)
  }
  if (toUpdate.length) {
    await playlist.updateEmbeddedDocuments('PlaylistSound', toUpdate)
  }

  return playlist
}

export async function syncAllModulePlaylists() {
  const playlists = playlistStore.getPlaylists()
  const results = []
  for (const pl of playlists) {
    results.push(await syncModulePlaylistToFoundry(pl))
  }
  return results
}

export async function deleteFoundryPlaylistForModule(modulePlaylist) {
  const playlist = findSyncedPlaylist(modulePlaylist)
  if (playlist) await playlist.delete()
}

export function getFoundryPlaylistForModule(modulePlaylistId) {
  const mp = playlistStore.getPlaylistById(modulePlaylistId)
  if (!mp) return null
  return findSyncedPlaylist(mp)
}
