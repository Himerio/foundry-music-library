export const MODULE_ID = 'foundry-music-library'
export const MODULE_PATH = `modules/${MODULE_ID}`
export const FLAG_SCOPE = 'modules'
export const FLAG_MODULE_PLAYLIST_ID = 'modulePlaylistId'
export const DEFAULT_SYNC_PREFIX = '[Music]'
export const EXPORT_SCHEMA_VERSION = 1
export const ROW_HEIGHT_PX = 36
export const VIRTUAL_OVERSCAN = 8

export const SETTING_KEYS = {
  MUSIC_ROOT: 'musicRoot',
  TRACK_INDEX: 'trackIndex',
  PLAYLISTS: 'playlists',
  SYNC_PREFIX: 'syncPrefix',
  ALLOW_ASSISTANT: 'allowAssistant',
  LIBRARY_UI: 'libraryUi',
  WIDGET_UI: 'widgetUi',
  SORT_BY: 'sortBy',
  SORT_DIR: 'sortDir',
  FILTER_QUERY: 'filterQuery',
  WIDGET_VISIBLE: 'widgetVisible',
  ACTIVE_MODULE_PLAYLIST_ID: 'activeModulePlaylistId',
  ACTIVE_TAGS: 'activeTags',
  FAVORITE_PATHS: 'favoritePaths',
  FAVORITES_ONLY: 'favoritesOnly',
  ACTIVE_ARTISTS: 'activeArtists',
  MISSING_METADATA_ONLY: 'missingMetadataOnly'
}

export const SORT_OPTIONS = [
  'title',
  'artist',
  'duration',
  'createdAt',
  'updatedAt'
]
