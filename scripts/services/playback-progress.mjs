import { formatDuration } from './track-display.mjs'

/**
 * @param {import('../data/schemas.mjs').MusicTrack | null} track
 * @param {foundry.documents.PlaylistSound | null} playlistSound
 * @returns {number | null}
 */
export function getTrackDurationSeconds(track, playlistSound) {
  const detected = track?.detected?.duration
  if (Number.isFinite(detected) && detected > 0) return detected
  const sound = playlistSound?.sound
  const fromSound = sound?.duration
  if (Number.isFinite(fromSound) && fromSound > 0) return fromSound
  return null
}

/**
 * @param {foundry.documents.PlaylistSound} playlistSound
 * @returns {Promise<foundry.audio.Sound | null>}
 */
export async function resolvePlayingSound(playlistSound) {
  if (!playlistSound) return null
  try {
    const sound = await playlistSound.sound
    return sound ?? null
  } catch {
    return null
  }
}

/**
 * @param {foundry.documents.PlaylistSound | null} playlistSound
 * @param {import('../data/schemas.mjs').MusicTrack | null} track
 * @returns {Promise<{ current: number, total: number, percent: number } | null>}
 */
export async function getPlaybackTimes(playlistSound, track) {
  if (!playlistSound?.playing) return null

  const audio = await resolvePlayingSound(playlistSound)
  const total = getTrackDurationSeconds(track, playlistSound)
  if (!audio || total == null || total <= 0) return null

  const current = Number(audio.currentTime)
  const safeCurrent = Number.isFinite(current) ? Math.max(0, Math.min(current, total)) : 0
  const percent = Math.min(100, Math.max(0, (safeCurrent / total) * 100))

  return { current: safeCurrent, total, percent }
}

/**
 * @param {number} current
 * @param {number} total
 */
export function formatProgressLabel(current, total) {
  return `${formatDuration(current)} / ${formatDuration(total)}`
}
