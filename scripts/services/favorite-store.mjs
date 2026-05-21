import { MODULE_ID, SETTING_KEYS } from '../constants.mjs'

export function getFavoritePaths() {
  return [...(game.settings.get(MODULE_ID, SETTING_KEYS.FAVORITE_PATHS) ?? [])]
}

export function isFavorite(path) {
  return getFavoritePaths().includes(path)
}

export async function toggleFavorite(path) {
  const favorites = getFavoritePaths()
  const idx = favorites.indexOf(path)
  if (idx >= 0) favorites.splice(idx, 1)
  else favorites.push(path)
  await game.settings.set(MODULE_ID, SETTING_KEYS.FAVORITE_PATHS, favorites)
  return idx < 0
}
