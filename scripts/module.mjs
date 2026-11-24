import { MODULE_ID } from './constants.mjs'
import { registerSettings } from './settings.mjs'
import { registerSceneControls } from './hooks/controls.mjs'
import { registerPlaylistHooks } from './hooks/playlist-hooks.mjs'
import { MusicLibraryApp } from './apps/music-library-app.mjs'
import { GmPlaybackWidget } from './apps/gm-playback-widget.mjs'
import { scanMusicLibrary } from './services/index-service.mjs'
import { downloadExportJson, pickAndImport } from './services/import-export.mjs'
import { syncAllModulePlaylists } from './services/foundry-sync.mjs'
import * as playlistStore from './services/playlist-store.mjs'

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | init`)
  registerSettings()
  registerSceneControls()
  registerPlaylistHooks()
})

Hooks.once('ready', async () => {
  if (game.user.isGM) {
    const pls = playlistStore.getPlaylists()
    if (pls.length) await syncAllModulePlaylists()
  }

  const api = {
    openLibrary: () => MusicLibraryApp.open(),
    openWidget: () => GmPlaybackWidget.open(),
    rescan: (opts) => scanMusicLibrary(opts ?? { forceMetadata: true }),
    exportLibrary: () => downloadExportJson(),
    importLibrary: (mode) => pickAndImport(mode ?? 'merge'),
    syncPlaylists: () => syncAllModulePlaylists(),
    _preview: null
  }
  // Standard package API location, plus the legacy global used by existing macros.
  game.modules.get(MODULE_ID).api = api
  game.musicLibrary = api
  console.log(`${MODULE_ID} | ready`)
})
