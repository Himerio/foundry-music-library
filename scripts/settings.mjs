import { MODULE_ID, SETTING_KEYS, DEFAULT_SYNC_PREFIX, SORT_OPTIONS } from './constants.mjs'
import { SettingsConfigApp } from './apps/settings-config-app.mjs'
import { refreshGmPlaybackWidget } from './apps/gm-playback-widget.mjs'

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_KEYS.MUSIC_ROOT, {
    name: game.i18n.localize('FML.Settings.MusicRoot.Name'),
    hint: game.i18n.localize('FML.Settings.MusicRoot.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: 'music',
    filePicker: 'folder'
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.SYNC_PREFIX, {
    name: game.i18n.localize('FML.Settings.SyncPrefix.Name'),
    hint: game.i18n.localize('FML.Settings.SyncPrefix.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_SYNC_PREFIX
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.ALLOW_ASSISTANT, {
    name: game.i18n.localize('FML.Settings.AllowAssistant.Name'),
    hint: game.i18n.localize('FML.Settings.AllowAssistant.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.TRACK_INDEX, {
    scope: 'world',
    config: false,
    type: Object,
    default: {}
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.PLAYLISTS, {
    scope: 'world',
    config: false,
    type: Array,
    default: [],
    onChange: () => refreshGmPlaybackWidget()
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.LIBRARY_UI, {
    scope: 'client',
    config: false,
    type: Object,
    default: { width: 960, height: 640, top: 80, left: 120 }
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.WIDGET_UI, {
    scope: 'client',
    config: false,
    type: Object,
    default: { top: 48, left: 48, width: 320 }
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.SORT_BY, {
    scope: 'client',
    config: false,
    type: String,
    default: 'title',
    choices: Object.fromEntries(SORT_OPTIONS.map((k) => [k, k]))
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.SORT_DIR, {
    scope: 'client',
    config: false,
    type: String,
    default: 'asc',
    choices: { asc: 'asc', desc: 'desc' }
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.FILTER_QUERY, {
    scope: 'client',
    config: false,
    type: String,
    default: ''
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.WIDGET_VISIBLE, {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID, {
    scope: 'client',
    config: false,
    type: String,
    default: ''
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS, {
    scope: 'client',
    config: false,
    type: Array,
    default: []
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.FAVORITE_PATHS, {
    scope: 'client',
    config: false,
    type: Array,
    default: []
  })

  game.settings.register(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY, {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  })

  game.settings.registerMenu(MODULE_ID, 'settingsMenu', {
    name: game.i18n.localize('FML.Settings.Menu.Name'),
    label: game.i18n.localize('FML.Settings.Menu.Label'),
    hint: game.i18n.localize('FML.Settings.Menu.Hint'),
    icon: 'fa-solid fa-music',
    type: SettingsConfigApp,
    restricted: true
  })
}
