/**
 * @typedef {Object} MusicTrackDetected
 * @property {string} [title]
 * @property {string} [artist]
 * @property {string} [album]
 * @property {number} [duration]
 */

/**
 * @typedef {Object} MusicTrackOverride
 * @property {string} [title]
 * @property {string} [artist]
 * @property {string} [album]
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} MusicTrack
 * @property {string} path
 * @property {string} filename
 * @property {'mp3'} format
 * @property {MusicTrackDetected} detected
 * @property {MusicTrackOverride} override
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} [fileSize]
 * @property {number} [fileModified]
 * @property {boolean} [missing]
 */

/**
 * @typedef {Object} ModulePlaylist
 * @property {string} id
 * @property {string} name
 * @property {string[]} trackPaths
 * @property {string} [foundryPlaylistId]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ExportBundle
 * @property {number} schemaVersion
 * @property {string} moduleVersion
 * @property {{ musicRoot: string }} settings
 * @property {Record<string, MusicTrack>} tracks
 * @property {ModulePlaylist[]} playlists
 */

export function createEmptyTrack(path, filename) {
  const now = new Date().toISOString()
  return {
    path,
    filename,
    format: 'mp3',
    detected: {},
    override: {},
    createdAt: now,
    updatedAt: now
  }
}

export function createPlaylist(name) {
  const now = new Date().toISOString()
  return {
    id: foundry.utils.randomID(),
    name,
    trackPaths: [],
    createdAt: now,
    updatedAt: now
  }
}
