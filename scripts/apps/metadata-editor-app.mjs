import { MODULE_PATH } from '../constants.mjs'
import { updateTrackOverride, getTrack } from '../services/index-service.mjs'
import {
  getTrackAlbum,
  getTrackArtist,
  getTrackTags,
  getTrackTitle
} from '../services/track-display.mjs'
import { dialogRenderOptions, readDialogForm } from '../utils/dialogs.mjs'

const { DialogV2 } = foundry.applications.api

/**
 * @param {string} path
 * @param {() => void} [onSaved]
 * @param {foundry.applications.api.ApplicationV2} [parent]
 */
export async function openMetadataEditor(path, onSaved, parent = null) {
  const track = getTrack(path)
  if (!track) return

  const content = await foundry.applications.handlebars.renderTemplate(
    `${MODULE_PATH}/templates/metadata-editor.hbs`,
    {
      title: getTrackTitle(track),
      artist: getTrackArtist(track),
      album: getTrackAlbum(track),
      tagsText: getTrackTags(track).join(', ')
    }
  )

  const submit = async (_event, button) => {
    const data = readDialogForm(button.form)
    const text = (key) => String(data[key] ?? '').trim() || undefined
    const tags = String(data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    await updateTrackOverride(path, {
      title: text('title'),
      artist: text('artist'),
      album: text('album'),
      tags
    })
    onSaved?.()
  }

  await DialogV2.wait({
    window: { title: game.i18n.localize('FML.Metadata.Title') },
    content,
    renderOptions: dialogRenderOptions(parent),
    buttons: [
      {
        action: 'save',
        label: game.i18n.localize('FML.Common.Save'),
        icon: 'fa-solid fa-save',
        default: true,
        callback: submit
      },
      {
        action: 'cancel',
        label: game.i18n.localize('FML.Common.Cancel'),
        icon: 'fa-solid fa-xmark'
      }
    ]
  })
}
