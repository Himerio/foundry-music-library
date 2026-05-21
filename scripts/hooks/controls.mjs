import { canManageMusicLibrary } from '../utils/permissions.mjs'
import { MusicLibraryApp } from '../apps/music-library-app.mjs'

export function registerSceneControls() {
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!canManageMusicLibrary()) return
    // Foundry v13+: controls is Record<name, SceneControl>, not an array
    const tokens = controls.tokens
    if (!tokens?.tools) return
    tokens.tools.musicLibrary = {
      name: 'musicLibrary',
      title: game.i18n.localize('FML.Controls.MusicLibrary'),
      icon: 'fa-solid fa-music',
      order: Object.keys(tokens.tools).length,
      button: true,
      visible: true,
      onChange: () => MusicLibraryApp.open()
    }
  })
}
