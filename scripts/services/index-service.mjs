import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'
import { createEmptyTrack } from '../data/schemas.mjs'
import { getMusicRoot, isMp3Filename, normalizeTrackPath } from './paths.mjs'
import { parseTrackMetadata } from './metadata-service.mjs'
import { getTrackArtist, getTrackTags, getTrackTitle, matchesSearchQuery } from './track-display.mjs'
import { getFavoritePaths } from './favorite-store.mjs'

export function getTrackIndex() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_KEYS.TRACK_INDEX) ?? {})
}

async function saveTrackIndex(index) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.TRACK_INDEX, index)
}

export function getTrack(path) {
  return getTrackIndex()[path] ?? null
}

export async function updateTrackOverride(path, override) {
  const index = getTrackIndex()
  const track = index[path]
  if (!track) return null
  track.override = foundry.utils.mergeObject(track.override ?? {}, override, { inplace: false })
  track.updatedAt = new Date().toISOString()
  index[path] = track
  await saveTrackIndex(index)
  return track
}

/**
 * @param {string[]} paths
 * @param {Record<string, unknown>} patch
 * @param {{ tagsMode?: 'replace' | 'merge' | 'clear' }} [options]
 */
export async function updateTracksOverride(paths, patch, options = {}) {
  const tagsMode = options.tagsMode ?? 'replace'
  const index = getTrackIndex()
  const fields = ['title', 'artist', 'album']
  let changed = 0

  for (const path of paths) {
    const track = index[path]
    if (!track) continue
    const override = foundry.utils.deepClone(track.override ?? {})

    for (const field of fields) {
      if (!(field in patch)) continue
      const value = patch[field]
      if (value === undefined) continue
      const trimmed = typeof value === 'string' ? value.trim() : value
      if (trimmed) override[field] = trimmed
      else delete override[field]
    }

    if ('tags' in patch) {
      const incoming = Array.isArray(patch.tags) ? patch.tags : []
      if (tagsMode === 'clear') {
        override.tags = []
      } else if (tagsMode === 'merge') {
        const merged = new Set([...(override.tags ?? []), ...incoming])
        override.tags = [...merged].filter(Boolean)
      } else {
        override.tags = incoming
      }
    }

    track.override = override
    track.updatedAt = new Date().toISOString()
    index[path] = track
    changed += 1
  }

  if (changed) await saveTrackIndex(index)
  return changed
}

/**
 * @param {import('../data/schemas.mjs').MusicTrack} track
 */
export function isMissingMetadata(track) {
  const hasTitle = Boolean(track.override?.title?.trim() || track.detected?.title?.trim())
  const hasArtist = Boolean(getTrackArtist(track)?.trim())
  return !hasTitle || !hasArtist
}

/**
 * Browse music root and return mp3 filenames in flat folder.
 */
export async function browseMusicFiles() {
  const root = getMusicRoot()
  const target = root.endsWith('/') ? root : `${root}/`
  const result = await foundry.applications.apps.FilePicker.browse('data', target, {
    extensions: ['.mp3'],
    wildcard: false
  })
  const prefix = target.replace(/\/$/, '')
  const files = (result.files ?? []).filter((f) => {
    const rel = f.startsWith(prefix) ? f.slice(prefix.length).replace(/^\//, '') : f.split('/').pop()
    const name = rel.includes('/') ? null : rel
    return name && isMp3Filename(name)
  })
  return { root, files, dirs: result.dirs ?? [] }
}

function fileStatsFromBrowse() {
  return { fileModified: Date.now() }
}

/**
 * @param {{ forceMetadata?: boolean }} options
 */
export async function scanMusicLibrary(options = {}) {
  const { files } = await browseMusicFiles()
  const index = getTrackIndex()
  const seen = new Set()
  let added = 0
  let updated = 0

  for (const filePath of files) {
    const filename = filePath.split('/').pop()
    const path = normalizeTrackPath(filename)
    seen.add(path)
    const existing = index[path]
    const needsMeta = options.forceMetadata || !existing?.detected?.duration

    if (!existing) {
      const track = createEmptyTrack(path, filename)
      track.detected = await parseTrackMetadata(path)
      index[path] = track
      added += 1
    } else if (needsMeta) {
      existing.detected = await parseTrackMetadata(path)
      existing.missing = false
      existing.updatedAt = new Date().toISOString()
      Object.assign(existing, fileStatsFromBrowse())
      index[path] = existing
      updated += 1
    } else {
      existing.missing = false
      index[path] = existing
    }
  }

  let missing = 0
  for (const path of Object.keys(index)) {
    if (!seen.has(path)) {
      index[path].missing = true
      missing += 1
    }
  }

  await saveTrackIndex(index)
  return { added, updated, missing, total: Object.keys(index).length }
}

function compareTracks(a, b, sortBy, sortDir) {
  const dir = sortDir === 'desc' ? -1 : 1
  let va
  let vb
  switch (sortBy) {
    case 'artist':
      va = getTrackArtist(a)
      vb = getTrackArtist(b)
      break
    case 'duration':
      va = a.detected?.duration ?? 0
      vb = b.detected?.duration ?? 0
      return dir * (va - vb)
    case 'createdAt':
      va = a.createdAt
      vb = b.createdAt
      break
    case 'updatedAt':
      va = a.updatedAt
      vb = b.updatedAt
      break
    default:
      va = getTrackTitle(a)
      vb = getTrackTitle(b)
  }
  if (va < vb) return -1 * dir
  if (va > vb) return 1 * dir
  return 0
}

/**
 * @param {string} [filterQuery]
 * @param {{ tagFilter?: string[], artistFilter?: string[], favoriteOnly?: boolean, missingMetadataOnly?: boolean }} [filters]
 */
export function getSortedTracks(sortBy = 'title', sortDir = 'asc', filterQuery = '', filters = {}) {
  const index = getTrackIndex()
  let tracks = Object.values(index)

  if (filterQuery?.trim()) {
    tracks = tracks.filter((t) => matchesSearchQuery(t, filterQuery))
  }

  const tagFilter = filters.tagFilter ?? []
  if (tagFilter.length) {
    const wanted = new Set(tagFilter.map((t) => t.toLowerCase()))
    tracks = tracks.filter((t) =>
      getTrackTags(t).some((tag) => wanted.has(tag.toLowerCase()))
    )
  }

  if (filters.favoriteOnly) {
    const favorites = new Set(getFavoritePaths())
    tracks = tracks.filter((t) => favorites.has(t.path))
  }

  const artistFilter = filters.artistFilter ?? []
  if (artistFilter.length) {
    const wanted = new Set(artistFilter.map((a) => a.toLowerCase()))
    tracks = tracks.filter((t) => {
      const artist = getTrackArtist(t)
      return artist && wanted.has(artist.toLowerCase())
    })
  }

  if (filters.missingMetadataOnly) {
    tracks = tracks.filter((t) => isMissingMetadata(t))
  }

  tracks.sort((a, b) => compareTracks(a, b, sortBy, sortDir))
  return tracks
}

const MAX_TAG_CHIPS = 30

const MAX_ARTIST_CHIPS = 30

export function collectArtistChips(max = MAX_ARTIST_CHIPS) {
  const index = getTrackIndex()
  const artists = new Set()
  for (const track of Object.values(index)) {
    const artist = getTrackArtist(track)?.trim()
    if (artist) artists.add(artist)
  }
  return [...artists].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).slice(0, max)
}

export function collectTagChips(max = MAX_TAG_CHIPS) {
  const index = getTrackIndex()
  const tags = new Set()
  for (const track of Object.values(index)) {
    for (const tag of getTrackTags(track)) {
      const trimmed = tag?.trim()
      if (trimmed) tags.add(trimmed)
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).slice(0, max)
}
