import { GmPlaybackWidget } from '../apps/gm-playback-widget.mjs'
import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'

export function registerPlaylistHooks() {
  const refreshWidget = foundry.utils.debounce(() => {
    const widget = foundry.applications.instances?.get('fml-gm-widget')
    if (widget?.rendered) widget.render(false)
  }, 200)

  Hooks.on('updatePlaylist', (doc, changes) => {
    if (doc.flags?.[MODULE_ID]) refreshWidget()
    if (changes.playing != null || changes.sounds) refreshWidget()
  })

  Hooks.on('updatePlaylistSound', () => refreshWidget())

  Hooks.once('ready', () => {
    if (!game.user.isGM) return
    if (!game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_VISIBLE)) return
    GmPlaybackWidget.open()
  })
}
