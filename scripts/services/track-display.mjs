/** Matches numeric order prefix added for Foundry playlist alpha-sort (e.g. "001 - Title"). */
const FOUNDRY_SOUND_ORDER_PREFIX = /^\d+ - /

/**
 * Prefix sound name so Foundry's alphabetical sort matches Music Library order.
 * Pad width scales with playlist size (min 3 digits) to avoid "1", "10", "2" ordering.
 * @param {number} sortIndex Zero-based index in the module playlist
 * @param {number} totalCount Tracks in the playlist
 * @param {string} displayTitle Human-readable title (no prefix)
 */
export function formatFoundrySoundName(sortIndex, totalCount, displayTitle) {
  if (totalCount <= 0) return displayTitle
  const width = Math.max(3, String(totalCount).length)
  const order = String(sortIndex + 1).padStart(width, '0')
  return `${order} - ${displayTitle}`
}

/**
 * Remove Foundry sync order prefix from a PlaylistSound name for display.
 * @param {string} name
 */
export function stripFoundrySortPrefix(name) {
  if (!name) return name
  return name.replace(FOUNDRY_SOUND_ORDER_PREFIX, '')
}

/**
 * Display title: override → detected → filename (without extension).
 * @param {import('../data/schemas.mjs').MusicTrack} track
 */
export function getTrackTitle(track) {
  if (track.override?.title?.trim()) return track.override.title.trim()
  if (track.detected?.title?.trim()) return track.detected.title.trim()
  return track.filename.replace(/\.mp3$/i, '')
}

export function getTrackArtist(track) {
  if (track.override?.artist?.trim()) return track.override.artist.trim()
  if (track.detected?.artist?.trim()) return track.detected.artist.trim()
  return ''
}

export function getTrackAlbum(track) {
  if (track.override?.album?.trim()) return track.override.album.trim()
  if (track.detected?.album?.trim()) return track.detected.album.trim()
  return ''
}

export function getTrackTags(track) {
  return track.override?.tags ?? []
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * @param {import('../data/schemas.mjs').MusicTrack} track
 */
export function getSearchBlob(track) {
  const parts = [
    getTrackTitle(track),
    getTrackArtist(track),
    getTrackAlbum(track),
    track.filename,
    ...getTrackTags(track)
  ]
  return parts.join(' ').toLowerCase()
}

/**
 * @param {import('../data/schemas.mjs').MusicTrack} track
 */
export function getDisplayLine(track) {
  const artist = getTrackArtist(track)
  const title = getTrackTitle(track)
  if (artist) return `${artist} — ${title}`
  return title
}
