import { MODULE_PATH } from '../constants.mjs'
import { dialogRenderOptions } from '../utils/dialogs.mjs'

const { DialogV2 } = foundry.applications.api

/**
 * @param {{ title: string, defaultValue?: string, parent?: foundry.applications.api.ApplicationV2 }} options
 * @returns {Promise<string | null>} Trimmed name, or null if cancelled / empty
 */
export async function promptPlaylistName({ title, defaultValue = '', parent = null }) {
  const content = await foundry.applications.handlebars.renderTemplate(
    `${MODULE_PATH}/templates/playlist-name-dialog.hbs`,
    { name: defaultValue }
  )

  const result = await DialogV2.wait({
    window: { title },
    position: { width: 360 },
    content,
    renderOptions: dialogRenderOptions(parent),
    buttons: [
      {
        action: 'ok',
        label: game.i18n.localize('FML.Common.Confirm'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_event, button) => button.form.elements.name?.value?.trim() ?? ''
      },
      {
        action: 'cancel',
        label: game.i18n.localize('FML.Common.Cancel'),
        icon: 'fa-solid fa-xmark',
        callback: () => null
      }
    ]
  })

  return result || null
}
