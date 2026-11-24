/**
 * Render options that open a dialog in the same browser window as its parent application.
 * Foundry v14 lets any ApplicationV2 be detached into its own window; without this, dialogs
 * spawned from a detached Music Library would appear back in the main workspace.
 * @param {foundry.applications.api.ApplicationV2 | null | undefined} parent
 * @returns {object}
 */
export function dialogRenderOptions(parent) {
  const windowId = parent?.window?.windowId
  return windowId ? { window: { windowId } } : {}
}

/**
 * Collect the named form fields of a dialog into a plain object.
 * @param {HTMLFormElement} form
 * @returns {Record<string, unknown>}
 */
export function readDialogForm(form) {
  return new foundry.applications.ux.FormDataExtended(form).object
}
