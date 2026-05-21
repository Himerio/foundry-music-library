import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'

export function canManageMusicLibrary() {
  if (!game.user) return false
  if (game.user.isGM) return true
  if (game.user.hasRole?.(CONST.USER_ROLES.ASSISTANT)) {
    return game.settings.get(MODULE_ID, SETTING_KEYS.ALLOW_ASSISTANT)
  }
  return false
}

export function canUseGmWidget() {
  return game.user?.isGM === true
}
