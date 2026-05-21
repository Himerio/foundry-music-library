import { MODULE_ID, MODULE_PATH, SETTING_KEYS } from '../constants.mjs'
import { canManageMusicLibrary } from '../utils/permissions.mjs'
import { MusicLibraryApp } from './music-library-app.mjs'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class SettingsConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'fml-settings-config',
    tag: 'form',
    window: {
      title: 'FML.Settings.Menu.Name',
      icon: 'fa-solid fa-music'
    },
    position: { width: 480 },
    actions: {
      browseRoot: SettingsConfigApp.onBrowseRoot,
      openLibrary: SettingsConfigApp.onOpenLibrary
    }
  }

  static PARTS = {
    form: {
      template: `${MODULE_PATH}/templates/settings-config.hbs`
    }
  }

  async _prepareContext() {
    return {
      musicRoot: game.settings.get(MODULE_ID, SETTING_KEYS.MUSIC_ROOT),
      allowAssistant: game.settings.get(MODULE_ID, SETTING_KEYS.ALLOW_ASSISTANT)
    }
  }

  async _onChangeForm(formConfig, event) {
    await super._onChangeForm(formConfig, event)
    if (this._suppressFormChange) return

    const target = event?.target
    if (!target?.name) return

    if (target.name === 'musicRoot') {
      const value = String(target.value).replace(/^\/+|\/+$/g, '')
      await game.settings.set(MODULE_ID, SETTING_KEYS.MUSIC_ROOT, value)
      return
    }

    if (target.name === 'allowAssistant') {
      await game.settings.set(MODULE_ID, SETTING_KEYS.ALLOW_ASSISTANT, target.checked)
    }
  }

  static async onBrowseRoot() {
    const app = this
    const FP = foundry.applications.apps.FilePicker
    const picker = new FP({
      type: 'folder',
      current: game.settings.get(MODULE_ID, SETTING_KEYS.MUSIC_ROOT) || 'music',
      bucket: 'data',
      callback: async (path) => {
        const clean = path.replace(/^\/+|\/+$/g, '')
        app._suppressFormChange = true
        try {
          await game.settings.set(MODULE_ID, SETTING_KEYS.MUSIC_ROOT, clean)
          const input = app.element?.querySelector('[name="musicRoot"]')
          if (input) input.value = clean
          await app.render(false)
        } finally {
          app._suppressFormChange = false
        }
      }
    })
    await picker.browse()
  }

  static onOpenLibrary() {
    if (!canManageMusicLibrary()) {
      ui.notifications.warn(game.i18n.localize('FML.Common.NoPermission'))
      return
    }
    MusicLibraryApp.open()
  }
}
