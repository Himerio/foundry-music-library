import { MODULE_PATH } from '../constants.mjs'

const { DialogV2 } = foundry.applications.api

/**
 * @param {{ title: string, defaultValue?: string }} options
 * @returns {Promise<string | null>} Trimmed name, or null if cancelled / empty
 */
export async function promptPlaylistName({ title, defaultValue = '' }) {
  const content = await foundry.applications.handlebars.renderTemplate(
    `${MODULE_PATH}/templates/playlist-name-dialog.hbs`,
    { name: defaultValue }
  )

  let submittedName = null

  const readName = (_event, button) => {
    const form = button.form ?? document.querySelector('.fml-playlist-name-dialog')
    submittedName = form?.elements?.name?.value?.trim() ?? ''
  }

  if (DialogV2?.wait) {
    const result = await DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: 'ok',
          label: game.i18n.localize('FML.Common.Confirm'),
          icon: 'fa-solid fa-check',
          default: true,
          callback: readName
        },
        {
          action: 'cancel',
          label: game.i18n.localize('FML.Common.Cancel'),
          icon: 'fa-solid fa-xmark'
        }
      ]
    })
    if (result !== 'ok' || !submittedName) return null
    return submittedName
  }

  return new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        ok: {
          label: game.i18n.localize('FML.Common.Confirm'),
          callback: (html) => {
            const value = html[0]?.querySelector('[name="name"]')?.value?.trim()
            resolve(value || null)
          }
        },
        cancel: {
          label: game.i18n.localize('FML.Common.Cancel'),
          callback: () => resolve(null)
        }
      },
      default: 'ok',
      close: () => resolve(null)
    }, {
      width: 360
    }).render(true)
  })
}
