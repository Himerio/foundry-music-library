import { MODULE_PATH } from '../constants.mjs'
import { updateTrackOverride, getTrack } from '../services/index-service.mjs'
import {
  getTrackAlbum,
  getTrackArtist,
  getTrackTags,
  getTrackTitle
} from '../services/track-display.mjs'

const { DialogV2 } = foundry.applications.api

/**
 * @param {string} path
 * @param {() => void} [onSaved]
 */
export async function openMetadataEditor(path, onSaved) {
  const track = getTrack(path)
  if (!track) return

  const tagsText = getTrackTags(track).join(', ')
  const content = await foundry.applications.handlebars.renderTemplate(
    `${MODULE_PATH}/templates/metadata-editor.hbs`,
    {
      title: getTrackTitle(track),
      artist: getTrackArtist(track),
      album: getTrackAlbum(track),
      tagsText
    }
  )

  const submit = async (_event, button) => {
    const form = button.form ?? document.querySelector('.fml-metadata-editor')
    const fd = new FormDataExtended(form)
    const tagsRaw = fd.get('tags')?.toString() ?? ''
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    await updateTrackOverride(path, {
      title: fd.get('title')?.toString()?.trim() || undefined,
      artist: fd.get('artist')?.toString()?.trim() || undefined,
      album: fd.get('album')?.toString()?.trim() || undefined,
      tags
    })
    onSaved?.()
  }

  if (DialogV2?.wait) {
    await DialogV2.wait({
      window: { title: game.i18n.localize('FML.Metadata.Title') },
      content,
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
    return
  }

  await new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize('FML.Metadata.Title'),
      content,
      buttons: {
        save: {
          label: game.i18n.localize('FML.Common.Save'),
          callback: async (html) => {
            const form = html[0]?.querySelector('form')
            const fd = new FormDataExtended(form)
            const tagsRaw = fd.get('tags')?.toString() ?? ''
            const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
            await updateTrackOverride(path, {
              title: fd.get('title')?.toString()?.trim() || undefined,
              artist: fd.get('artist')?.toString()?.trim() || undefined,
              album: fd.get('album')?.toString()?.trim() || undefined,
              tags
            })
            onSaved?.()
            resolve()
          }
        },
        cancel: { label: game.i18n.localize('FML.Common.Cancel'), callback: () => resolve() }
      },
      default: 'save'
    }).render(true)
  })
}
