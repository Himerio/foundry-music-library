import { MODULE_PATH } from '../constants.mjs'
import { getTrack, updateTrackOverride } from '../services/index-service.mjs'
import {
  getTrackAlbum,
  getTrackArtist,
  getTrackTags,
  getTrackTitle
} from '../services/track-display.mjs'

const { DialogV2 } = foundry.applications.api

/**
 * @param {HTMLFormElement} form
 */
function readApplyFlags(form) {
  return {
    title: Boolean(form.elements.applyTitle?.checked),
    artist: Boolean(form.elements.applyArtist?.checked),
    album: Boolean(form.elements.applyAlbum?.checked),
    tags: Boolean(form.elements.applyTags?.checked)
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ title: boolean, artist: boolean, album: boolean, tags: boolean }} apply
 * @param {string} tagsMode
 */
async function submitBulkForm(root, apply, tagsMode) {
  if (!apply.title && !apply.artist && !apply.album && !apply.tags) {
    ui.notifications.warn(game.i18n.localize('FML.Bulk.NothingSelected'))
    return 0
  }

  let changed = 0
  const rows = root.querySelectorAll('tbody tr[data-path]')

  for (const row of rows) {
    const path = row.dataset.path
    if (!path || !getTrack(path)) continue

    const patch = {}

    if (apply.title) {
      patch.title = row.querySelector('input[name="title"]')?.value?.toString()?.trim() ?? ''
    }
    if (apply.artist) {
      patch.artist = row.querySelector('input[name="artist"]')?.value?.toString()?.trim() ?? ''
    }
    if (apply.album) {
      patch.album = row.querySelector('input[name="album"]')?.value?.toString()?.trim() ?? ''
    }
    if (apply.tags) {
      if (tagsMode === 'clear') {
        patch.tags = []
      } else {
        const tagsRaw = row.querySelector('input[name="tags"]')?.value?.toString() ?? ''
        patch.tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      }
    }

    const override = {}
    for (const field of ['title', 'artist', 'album']) {
      if (!(field in patch)) continue
      const trimmed = patch[field]
      override[field] = trimmed || undefined
    }

    if ('tags' in patch) {
      const track = getTrack(path)
      const existing = track?.override?.tags ?? []
      if (tagsMode === 'clear') {
        override.tags = []
      } else if (tagsMode === 'merge') {
        const merged = new Set([...existing, ...patch.tags])
        override.tags = [...merged].filter(Boolean)
      } else {
        override.tags = patch.tags
      }
    }

    if (!Object.keys(override).length) continue

    await updateTrackOverride(path, override)
    changed += 1
  }

  return changed
}

/**
 * @param {string[]} paths
 * @param {() => void} [onSaved]
 */
export async function openBulkMetadataEditor(paths, onSaved) {
  const unique = [...new Set(paths)].filter(Boolean)
  if (!unique.length) return

  const rows = unique.map((path) => {
    const track = getTrack(path)
    if (!track) return null
    return {
      path,
      label: getTrackTitle(track),
      filename: track.filename,
      title: getTrackTitle(track),
      artist: getTrackArtist(track),
      album: getTrackAlbum(track),
      tagsText: getTrackTags(track).join(', ')
    }
  }).filter(Boolean)

  if (!rows.length) return

  const content = await foundry.applications.handlebars.renderTemplate(
    `${MODULE_PATH}/templates/bulk-metadata-editor.hbs`,
    {
      summary: game.i18n.format('FML.Bulk.Summary', { count: rows.length }),
      trackColumn: game.i18n.localize('FML.Bulk.TrackColumn'),
      tagsModeLabel: game.i18n.localize('FML.Bulk.TagsModeLabel'),
      tagsReplace: game.i18n.localize('FML.Bulk.TagsReplace'),
      tagsMerge: game.i18n.localize('FML.Bulk.TagsMerge'),
      tagsClear: game.i18n.localize('FML.Bulk.TagsClear'),
      leaveEmptyHint: game.i18n.localize('FML.Bulk.LeaveEmptyClear'),
      tagsHint: game.i18n.localize('FML.Metadata.TagsHint'),
      rows
    }
  )

  const submit = async (_event, button) => {
    const form = button.form
    const root = form?.querySelector('.fml-bulk-metadata-editor')
    if (!form || !root) return
    const apply = readApplyFlags(form)
    const tagsMode = form.elements.tagsMode?.value?.toString() ?? 'replace'
    const changed = await submitBulkForm(root, apply, tagsMode)
    if (changed) {
      ui.notifications.info(game.i18n.format('FML.Bulk.Saved', { count: changed }))
      onSaved?.()
    }
  }

  if (DialogV2?.wait) {
    await DialogV2.wait({
      window: {
        title: game.i18n.localize('FML.Bulk.Title'),
        icon: 'fa-solid fa-pen-to-square'
      },
      classes: ['fml-bulk-metadata-dialog'],
      position: { width: 1020 },
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
      title: game.i18n.localize('FML.Bulk.Title'),
      content,
      buttons: {
        save: {
          label: game.i18n.localize('FML.Common.Save'),
          callback: async (html) => {
            const form = html[0]?.querySelector('form')
            const root = html[0]?.querySelector('.fml-bulk-metadata-editor')
            if (!form || !root) {
              resolve()
              return
            }
            const apply = readApplyFlags(form)
            const tagsMode = form.elements.tagsMode?.value?.toString() ?? 'replace'
            const changed = await submitBulkForm(root, apply, tagsMode)
            if (changed) onSaved?.()
            resolve()
          }
        },
        cancel: { label: game.i18n.localize('FML.Common.Cancel'), callback: () => resolve() }
      },
      default: 'save'
    }).render(true)
  })
}
