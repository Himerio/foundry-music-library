import {
  FLAG_MODULE_PLAYLIST_ID,
  MODULE_ID
} from '../constants.mjs'
import { getSyncPrefix } from './foundry-sync.mjs'
import { toFoundryMediaPath } from './paths.mjs'

/** @param {foundry.documents.Playlist | null} playlist */
export function getPlaylistSoundList(playlist) {
  if (!playlist?.sounds) return []
  return playlist.sounds.contents ?? [...playlist.sounds]
}

/**
 * @param {string} [excludeModulePlaylistId] Module playlist id to leave untouched
 */
export async function stopAllModulePlaylists(excludeModulePlaylistId = null) {
  const prefix = getSyncPrefix()
  const stops = []
  for (const playlist of game.playlists) {
    const modulePlaylistId = playlist.getFlag?.(MODULE_ID, FLAG_MODULE_PLAYLIST_ID)
    const isOurs = Boolean(modulePlaylistId)
      || (typeof playlist.name === 'string' && playlist.name.startsWith(prefix))
    if (!isOurs) continue
    if (excludeModulePlaylistId && modulePlaylistId === excludeModulePlaylistId) continue

    const isActive = playlist.playing
      || getPlaylistSoundList(playlist).some((s) => s.playing)
    if (isActive) stops.push(playlist.stopAll())
  }
  if (stops.length) await Promise.all(stops)
}

export function isPlaylistShuffle(playlist) {
  return playlist?.mode === CONST.PLAYLIST_MODES.SHUFFLE
}

export function getNextPlaylistMode(playlist) {
  return isPlaylistShuffle(playlist)
    ? CONST.PLAYLIST_MODES.SEQUENTIAL
    : CONST.PLAYLIST_MODES.SHUFFLE
}

/** @type {number} Matches default volume in foundry-sync.mjs */
export const DEFAULT_PLAYLIST_SOUND_VOLUME = 0.8

/**
 * @param {foundry.documents.Playlist | null} playlist
 * @returns {number}
 */
export function getPlaylistVolume(playlist) {
  const sounds = playlist?.sounds?.contents ?? []
  if (!sounds.length) return DEFAULT_PLAYLIST_SOUND_VOLUME
  const playing = sounds.find((s) => s.playing)
  const ref = playing ?? sounds[0]
  const vol = Number(ref?.volume)
  return Number.isFinite(vol) ? vol : DEFAULT_PLAYLIST_SOUND_VOLUME
}

/**
 * Set volume on all sounds in a Foundry playlist (0–1). Uses debounceVolume on the
 * currently playing sound so playback updates immediately.
 * @param {foundry.documents.Playlist} playlist
 * @param {number} volume
 */
/**
 * @param {foundry.documents.Playlist} playlist
 * @param {string} trackPath
 * @returns {foundry.documents.PlaylistSound | null}
 */
export function findSoundByTrackPath(playlist, trackPath) {
  if (!playlist || !trackPath) return null
  const media = toFoundryMediaPath(trackPath)
  return getPlaylistSoundList(playlist).find(
    (s) => toFoundryMediaPath(s.path ?? '') === media
  ) ?? null
}

/**
 * @param {foundry.documents.Playlist} playlist
 * @param {foundry.documents.PlaylistSound} sound
 * @param {string} [excludeModulePlaylistId]
 */
export async function playPlaylistSound(playlist, sound, excludeModulePlaylistId = null) {
  if (!playlist || !sound) return false
  await stopAllModulePlaylists(excludeModulePlaylistId)
  await playlist.playSound(sound)
  return true
}

export async function setPlaylistVolume(playlist, volume) {
  const sounds = playlist?.sounds?.contents ?? []
  if (!sounds.length) return

  const vol = Math.clamp(Number(volume), 0, 1)
  const playing = sounds.find((s) => s.playing)
  if (playing?.debounceVolume) {
    playing.debounceVolume(vol)
  }

  const updates = sounds.map((s) => ({ _id: s.id, volume: vol }))
  await playlist.updateEmbeddedDocuments('PlaylistSound', updates)
}
