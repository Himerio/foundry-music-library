import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'
import { createEmptyTrack } from '../data/schemas.mjs'
import { getMusicRoot, isMp3Filename, normalizeTrackPath } from './paths.mjs'
import { parseTrackMetadata } from './metadata-service.mjs'
import { getSearchBlob, getTrackArtist, getTrackTags, getTrackTitle } from './track-display.mjs'
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
 * @param {{ tagFilter?: string[], favoriteOnly?: boolean }} [filters]
 */
export function getSortedTracks(sortBy = 'title', sortDir = 'asc', filterQuery = '', filters = {}) {
  const index = getTrackIndex()
  let tracks = Object.values(index)

  if (filterQuery?.trim()) {
    const q = filterQuery.trim().toLowerCase()
    tracks = tracks.filter((t) => getSearchBlob(t).includes(q))
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

  tracks.sort((a, b) => compareTracks(a, b, sortBy, sortDir))
  return tracks
}

const MAX_TAG_CHIPS = 30

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
