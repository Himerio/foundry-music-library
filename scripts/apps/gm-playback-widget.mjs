import { MODULE_ID, MODULE_PATH, SETTING_KEYS } from '../constants.mjs'
import { canUseGmWidget } from '../utils/permissions.mjs'
import * as playlistStore from '../services/playlist-store.mjs'
import { getFoundryPlaylistForModule, syncModulePlaylistToFoundry } from '../services/foundry-sync.mjs'
import {
  findSoundByTrackPath,
  getNextPlaylistMode,
  getPlaylistSoundList,
  getPlaylistVolume,
  isPlaylistShuffle,
  playPlaylistSound,
  setPlaylistVolume,
  stopAllModulePlaylists
} from '../services/playback-control.mjs'
import { formatDuration, getDisplayLine, stripFoundrySortPrefix } from '../services/track-display.mjs'
import { getTrack } from '../services/index-service.mjs'
import {
  formatProgressLabel,
  getPlaybackTimes,
  getTrackDurationSeconds
} from '../services/playback-progress.mjs'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

const WIDGET_WIDTH_FULL = 520
const WIDGET_WIDTH_FULL_MIN = 480
const WIDGET_WIDTH_COMPACT = 240
const COMPACT_IDLE_MS = 2000
const PROGRESS_TICK_MS = 250

export async function refreshGmPlaybackWidget() {
  const widget = foundry.applications.instances?.get('fml-gm-widget')
  if (!widget?.rendered) return
  await widget._ensureActivePlaylistSetting()
  widget.render(false)
}

export class GmPlaybackWidget extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'fml-gm-widget',
    classes: ['fml-gm-widget'],
    tag: 'div',
    window: {
      title: 'FML.Widget.Title',
      icon: 'fa-solid fa-compact-disc',
      frame: true,
      positioned: true
    },
    position: { width: WIDGET_WIDTH_FULL }
  }

  static PARTS = {
    main: {
      template: `${MODULE_PATH}/templates/gm-widget.hbs`
    }
  }

  static open() {
    if (!canUseGmWidget()) return null
    const existing = foundry.applications.instances?.get('fml-gm-widget')
    if (existing) {
      existing._ensureActivePlaylistSetting().then(() => existing.render(false))
      return existing
    }
    const prefs = game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI) ?? {}
    const app = new GmPlaybackWidget()
    game.settings.set(MODULE_ID, SETTING_KEYS.WIDGET_VISIBLE, true)
    let width = prefs.compact ? (prefs.compactWidth ?? WIDGET_WIDTH_COMPACT) : (prefs.width ?? WIDGET_WIDTH_FULL)
    if (!prefs.compact && width < WIDGET_WIDTH_FULL_MIN) width = WIDGET_WIDTH_FULL
    const position = { width }
    if (Number.isFinite(prefs.top)) position.top = prefs.top
    if (Number.isFinite(prefs.left)) position.left = prefs.left
    app.render(true, { position })
    return app
  }

  async _prepareContext() {
    const playlists = playlistStore.getPlaylists()
    await this._ensureActivePlaylistSetting()
    const activeId = this._getActiveModulePlaylistId()
    const widgetUi = game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI) ?? {}
    const compact = Boolean(widgetUi.compact)

    let foundryPl = activeId ? getFoundryPlaylistForModule(activeId) : null
    const modulePl = activeId ? playlistStore.getPlaylistById(activeId) : null
    if (!compact && modulePl?.trackPaths?.length) {
      try {
        foundryPl = await syncModulePlaylistToFoundry(modulePl)
      } catch (e) {
        console.error('FML | Widget playlist sync failed', e)
      }
    }
    const playingSound = this._getPlayingSound(foundryPl)
    let nowPlaying = game.i18n.localize('FML.Widget.NothingPlaying')
    let progressTrack = null
    if (playingSound) {
      const trackPath = modulePl?.trackPaths?.find((p) => {
        const media = p.replace(/^\//, '')
        return playingSound.path?.replace(/^\//, '') === media
      })
      progressTrack = trackPath ? getTrack(trackPath) : null
      nowPlaying = progressTrack
        ? getDisplayLine(progressTrack)
        : stripFoundrySortPrefix(playingSound.name)
    }

    const progress = await this._resolveProgressState(playingSound, progressTrack)

    const isPlaying = Boolean(playingSound)
    const shuffle = isPlaylistShuffle(foundryPl)
    const playlistTracks = this._buildPlaylistTracks(activeId, foundryPl, playingSound, compact)

    return {
      playlists,
      activePlaylistId: activeId,
      nowPlaying,
      playlistTracks,
      showTrackList: !compact && playlistTracks.length > 0,
      compact,
      compactIcon: compact ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center',
      compactLabel: compact
        ? game.i18n.localize('FML.Widget.Expand')
        : game.i18n.localize('FML.Widget.Compact'),
      volume: getPlaylistVolume(foundryPl),
      playPauseIcon: isPlaying ? 'fa-stop' : 'fa-play',
      playPauseLabel: isPlaying
        ? game.i18n.localize('FML.Widget.Stop')
        : game.i18n.localize('FML.Widget.Play'),
      modeIcon: shuffle ? 'fa-shuffle' : 'fa-arrow-down-wide-short',
      modeLabel: shuffle
        ? game.i18n.localize('FML.Widget.ModeShuffle')
        : game.i18n.localize('FML.Widget.ModeSequential'),
      showProgress: progress.showProgress,
      progressPercent: progress.progressPercent,
      progressLabel: progress.progressLabel
    }
  }

  async _resolveProgressState(playingSound, track) {
    if (!playingSound?.playing) {
      return { showProgress: false, progressPercent: 0, progressLabel: '0:00 / 0:00' }
    }
    const times = await getPlaybackTimes(playingSound, track)
    const total = times?.total ?? getTrackDurationSeconds(track, playingSound)
    if (!times && (total == null || total <= 0)) {
      return { showProgress: false, progressPercent: 0, progressLabel: '0:00 / 0:00' }
    }
    const current = times?.current ?? 0
    const safeTotal = times?.total ?? total ?? 0
    const percent = times?.percent ?? 0
    return {
      showProgress: safeTotal > 0,
      progressPercent: Math.round(percent),
      progressLabel: formatProgressLabel(current, safeTotal)
    }
  }

  _getProgressTrackForSound(foundryPl, playingSound, modulePl) {
    if (!playingSound || !modulePl?.trackPaths?.length) return null
    const trackPath = modulePl.trackPaths.find((p) => {
      const media = p.replace(/^\//, '')
      return playingSound.path?.replace(/^\//, '') === media
    })
    return trackPath ? getTrack(trackPath) : null
  }

  async _patchProgressUi() {
    const activeId = this._getActiveModulePlaylistId()
    const modulePl = activeId ? playlistStore.getPlaylistById(activeId) : null
    const foundryPl = activeId ? getFoundryPlaylistForModule(activeId) : null
    const playingSound = this._getPlayingSound(foundryPl)
    const track = this._getProgressTrackForSound(foundryPl, playingSound, modulePl)
    const progress = await this._resolveProgressState(playingSound, track)

    for (const block of this.element?.querySelectorAll('.fml-widget-progress') ?? []) {
      block.setAttribute('aria-hidden', progress.showProgress ? 'false' : 'true')
      const trackEl = block.querySelector('.fml-widget-progress-track')
      const fill = block.querySelector('.fml-widget-progress-fill')
      const time = block.querySelector('.fml-widget-progress-time')
      if (trackEl) {
        trackEl.setAttribute('aria-valuenow', String(progress.progressPercent))
      }
      if (fill) fill.style.width = `${progress.progressPercent}%`
      if (time) time.textContent = progress.progressLabel
    }

    if (playingSound?.playing) {
      this._startProgressTicker()
    } else {
      this._stopProgressTicker()
    }
  }

  _startProgressTicker() {
    if (this._progressTickerActive) return
    this._progressTickerActive = true
    this._progressLastTick = 0

    const tick = (timestamp) => {
      if (!this._progressTickerActive || !this.rendered) return
      if (!this._progressLastTick || timestamp - this._progressLastTick >= PROGRESS_TICK_MS) {
        this._progressLastTick = timestamp
        this._patchProgressUi().catch((e) => console.error('FML | Progress tick failed', e))
      }
      this._progressRafId = requestAnimationFrame(tick)
    }
    this._progressRafId = requestAnimationFrame(tick)
  }

  _stopProgressTicker() {
    this._progressTickerActive = false
    if (this._progressRafId != null) {
      cancelAnimationFrame(this._progressRafId)
      this._progressRafId = null
    }
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options)
    const compact = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI)?.compact)
    options.window = foundry.utils.mergeObject(options.window ?? {}, { frame: !compact })
  }

  async _onRender(context, options) {
    await super._onRender(context, options)
    const compact = Boolean(context.compact)
    this._widgetFramed = !compact
    this.element?.classList.toggle('fml-gm-widget--compact', compact)
    this._syncCompactChrome(compact)
    if (!compact) {
      this._ensureFullWidthLayout()
      requestAnimationFrame(() => {
        if (!this.rendered) return
        this._syncTrackMarquees()
        this._ensureTrackMarqueeObserver()
      })
    }
    this._patchProgressUi().catch((e) => console.error('FML | Progress init failed', e))
  }

  _syncTrackMarquees() {
    const list = this.element?.querySelector('.fml-widget-track-list')
    if (!list) return

    for (const btn of list.querySelectorAll('.fml-widget-track-btn')) {
      const clip = btn.querySelector('.fml-widget-track-title')
      const textEl = btn.querySelector('.fml-widget-track-title-text')
      if (!clip || !textEl) continue

      btn.classList.remove('is-marquee')
      btn.style.removeProperty('--marquee-distance')
      btn.style.removeProperty('--marquee-duration')

      if (!btn.classList.contains('is-playing')) continue

      const distance = textEl.scrollWidth - clip.clientWidth
      if (distance <= 2) continue

      btn.classList.add('is-marquee')
      btn.style.setProperty('--marquee-distance', `${distance}px`)
      btn.style.setProperty('--marquee-duration', `${Math.max(10, 6 + distance / 10)}s`)
    }
  }

  _ensureTrackMarqueeObserver() {
    const list = this.element?.querySelector('.fml-widget-track-list')
    if (!list || typeof ResizeObserver === 'undefined') return

    if (this._trackMarqueeObservedList === list) return
    this._trackMarqueeObserver?.disconnect()
    this._trackMarqueeObservedList = list
    this._trackMarqueeObserver = new ResizeObserver(() => this._syncTrackMarquees())
    this._trackMarqueeObserver.observe(list)
  }

  _getUiFadeConfig() {
    const fade = CONFIG?.ui?.fade ?? {}
    return {
      opacity: Number.isFinite(fade.opacity) ? fade.opacity : 0.5,
      speed: Number.isFinite(fade.speed) ? fade.speed : 500
    }
  }

  _syncApplicationTheme() {
    const el = this.element
    if (!el) return
    el.classList.add('themed')
    const ui = document.getElementById('interface')
    const light = ui?.classList.contains('theme-light') ?? document.body.classList.contains('theme-light')
    el.classList.toggle('theme-light', light)
    el.classList.toggle('theme-dark', !light)
  }

  _syncCompactChrome(compact) {
    if (!this.element) return
    this._syncApplicationTheme()
    if (!compact) {
      this._clearCompactIdleFade()
      return
    }
    const { opacity, speed } = this._getUiFadeConfig()
    this.element.style.setProperty('--fml-compact-fade-opacity', String(opacity))
    this.element.style.setProperty('--fml-compact-fade-speed', `${speed}ms`)
    if (!this.element.classList.contains('fml-gm-widget--hover')) {
      this._scheduleCompactIdleFade()
    }
  }

  _clearCompactIdleFade() {
    clearTimeout(this._compactIdleTimer)
    this._compactIdleTimer = null
    this.element?.classList.remove('fml-gm-widget--idle', 'fml-gm-widget--hover')
  }

  _scheduleCompactIdleFade() {
    clearTimeout(this._compactIdleTimer)
    this._compactIdleTimer = setTimeout(() => {
      if (!game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI)?.compact) return
      this.element?.classList.add('fml-gm-widget--idle')
    }, COMPACT_IDLE_MS)
  }

  _bindCompactIdleFade() {
    if (this._compactIdleFadeBound) return
    this._compactIdleFadeBound = true

    const onEnter = () => {
      if (!game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI)?.compact) return
      clearTimeout(this._compactIdleTimer)
      this.element?.classList.remove('fml-gm-widget--idle')
      this.element?.classList.add('fml-gm-widget--hover')
    }

    const onLeave = () => {
      if (!game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI)?.compact) return
      this.element?.classList.remove('fml-gm-widget--hover')
      this._scheduleCompactIdleFade()
    }

    this.element.addEventListener('pointerenter', onEnter)
    this.element.addEventListener('pointerleave', onLeave)
    this.element.addEventListener('focusin', onEnter)
    this.element.addEventListener('focusout', onLeave)
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options)
    this._bindWidgetEvents()
    this._bindCompactIdleFade()
    await this._ensureActivePlaylistSetting()
  }

  _bindWidgetEvents() {
    if (this._widgetEventsBound) return
    this._widgetEventsBound = true

    this.element.addEventListener('click', (event) => {
      const button = event.target.closest('.fml-widget button[data-action]')
      if (!button) return
      event.preventDefault()
      const { action } = button.dataset
      switch (action) {
        case 'closeWidget':
          this.close()
          break
        case 'prev':
          this._onPrev()
          break
        case 'next':
          this._onNext()
          break
        case 'togglePlay':
          this._onTogglePlay()
          break
        case 'toggleMode':
          this._onToggleMode()
          break
        case 'toggleCompact':
          this._onToggleCompact()
          break
        case 'playTrack':
          this._onPlayTrack(button)
          break
        default:
          break
      }
    })

    this.element.addEventListener('change', (event) => {
      const el = event.target
      if (el.matches('.fml-widget select[name="playlistId"]')) {
        this._onPlaylistSelect(el)
      }
    })

    this.element.addEventListener('pointerdown', (event) => {
      if (!game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI)?.compact) return
      if (!event.target.closest('.fml-widget-header')) return
      if (event.target.closest('button, select, input, option')) return
      if (event.button !== 0) return
      event.preventDefault()
      const start = {
        x: event.clientX,
        y: event.clientY,
        left: this.position?.left ?? 0,
        top: this.position?.top ?? 0
      }
      const onMove = (e) => {
        if (typeof this.setPosition !== 'function') return
        this.setPosition({
          ...this.position,
          left: start.left + (e.clientX - start.x),
          top: start.top + (e.clientY - start.y)
        })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        this._schedulePersistWidgetPosition()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    })

    this.element.addEventListener('input', (event) => {
      const el = event.target
      if (el.matches('.fml-widget input[name="volume"]')) {
        this._onVolumeInput(el)
      }
    })
  }

  _getActiveModulePlaylistId() {
    const playlists = playlistStore.getPlaylists()
    let activeId = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID)

    if (!activeId || !playlistStore.getPlaylistById(activeId)) {
      activeId = playlists[0]?.id ?? null
      if (!activeId) {
        const select = this.element?.querySelector('.fml-widget select[name="playlistId"]')
        const fromSelect = select?.value
        if (fromSelect && playlistStore.getPlaylistById(fromSelect)) activeId = fromSelect
      }
    }

    return activeId || null
  }

  async _ensureActivePlaylistSetting() {
    const resolved = this._getActiveModulePlaylistId()
    const next = resolved ?? ''
    const current = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID)
    if (current !== next) {
      await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID, next)
    }
  }

  async _getActiveFoundryPlaylist() {
    const moduleId = this._getActiveModulePlaylistId()
    if (!moduleId) return null

    const modulePl = playlistStore.getPlaylistById(moduleId)
    if (!modulePl) return null

    let foundryPl = getFoundryPlaylistForModule(moduleId)
    if (!foundryPl) {
      try {
        foundryPl = await syncModulePlaylistToFoundry(modulePl)
      } catch (e) {
        console.error('FML | Failed to sync playlist for playback', e)
        return null
      }
    }
    return foundryPl
  }

  _getPlaylistSounds(playlist) {
    return getPlaylistSoundList(playlist)
  }

  _getPlayingSound(playlist) {
    return getPlaylistSoundList(playlist).find((s) => s.playing) ?? null
  }

  _buildPlaylistTracks(activeId, foundryPl, playingSound, compact) {
    if (compact || !activeId) return []
    const modulePl = playlistStore.getPlaylistById(activeId)
    if (!modulePl?.trackPaths?.length) return []

    const playingId = playingSound?.id ?? null
    return modulePl.trackPaths.map((path) => {
      const track = getTrack(path)
      const sound = foundryPl ? findSoundByTrackPath(foundryPl, path) : null
      return {
        path,
        display: track ? getDisplayLine(track) : path,
        duration: track ? formatDuration(track.detected?.duration) : '—',
        playing: Boolean(sound && playingId && sound.id === playingId)
      }
    })
  }

  async _onPlaylistSelect(select) {
    const id = select.value
    if (!id) return
    await stopAllModulePlaylists()
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID, id)
    await this.render(false)
  }

  async _onPrev() {
    const pl = await this._getActiveFoundryPlaylist()
    if (!pl) {
      this._warnNoPlaybackPlaylist()
      return
    }
    const current = this._getPlayingSound(pl)?.id
    await pl.playNext(current, { direction: -1 })
    await this.render(false)
  }

  async _onNext() {
    const pl = await this._getActiveFoundryPlaylist()
    if (!pl) {
      this._warnNoPlaybackPlaylist()
      return
    }
    const current = this._getPlayingSound(pl)?.id
    await pl.playNext(current, { direction: 1 })
    await this.render(false)
  }

  async _onTogglePlay() {
    await this._ensureActivePlaylistSetting()
    const moduleId = this._getActiveModulePlaylistId()
    const pl = await this._getActiveFoundryPlaylist()
    if (!pl) {
      this._warnNoPlaybackPlaylist()
      return
    }
    const playing = this._getPlayingSound(pl)
    if (playing) {
      await pl.stopAll()
    } else {
      const sounds = this._getPlaylistSounds(pl)
      if (!sounds.length) {
        ui.notifications.warn(game.i18n.localize('FML.Library.EmptyPlaylistTracks'))
        return
      }
      await stopAllModulePlaylists(moduleId)
      try {
        const first = sounds[0]
        if (first) await pl.playSound(first)
        else await pl.playNext()
      } catch (e) {
        console.error('FML | Playback failed', e)
        ui.notifications.error(game.i18n.localize('FML.Common.Error'))
        return
      }
    }
    await this.render(false)
  }

  async _onPlayTrack(button) {
    const trackPath = button.dataset.trackPath
    if (!trackPath) return
    const pl = await this._getActiveFoundryPlaylist()
    if (!pl) {
      this._warnNoPlaybackPlaylist()
      return
    }
    const sound = findSoundByTrackPath(pl, trackPath)
    if (!sound) {
      ui.notifications.warn(game.i18n.localize('FML.Widget.TrackNotAvailable'))
      return
    }
    const moduleId = this._getActiveModulePlaylistId()
    try {
      await playPlaylistSound(pl, sound, moduleId)
    } catch (e) {
      console.error('FML | Play track failed', e)
      ui.notifications.error(game.i18n.localize('FML.Common.Error'))
      return
    }
    await this.render(false)
  }

  async _onToggleMode() {
    const pl = await this._getActiveFoundryPlaylist()
    if (!pl) {
      this._warnNoPlaybackPlaylist()
      return
    }
    const nextMode = getNextPlaylistMode(pl)
    await pl.update({ mode: nextMode })
    await this.render(false)
  }

  _warnNoPlaybackPlaylist() {
    if (!playlistStore.getPlaylists().length) {
      ui.notifications.warn(game.i18n.localize('FML.Library.SelectPlaylist'))
      return
    }
    ui.notifications.warn(game.i18n.localize('FML.Widget.PlaylistNotSynced'))
  }

  async _onVolumeInput(input) {
    const pl = await this._getActiveFoundryPlaylist()
    const vol = Number(input.value)
    if (!pl || Number.isNaN(vol)) return
    try {
      await setPlaylistVolume(pl, vol)
    } catch (e) {
      console.error('FML | Volume update failed', e)
    }
  }

  _ensureFullWidthLayout() {
    const w = Number(this.position?.width) || 0
    if (w >= WIDGET_WIDTH_FULL_MIN) return
    const position = { ...this.position, width: WIDGET_WIDTH_FULL }
    if (typeof this.setPosition === 'function') this.setPosition(position)
    const prefs = game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI) ?? {}
    if (!prefs.compact && (Number(prefs.width) || 0) < WIDGET_WIDTH_FULL_MIN) {
      game.settings.set(MODULE_ID, SETTING_KEYS.WIDGET_UI, { ...prefs, width: WIDGET_WIDTH_FULL }).catch(
        (e) => console.error('FML | Widget width save failed', e)
      )
    }
  }

  _resolveWidgetWidths(prefs = {}) {
    let fullWidth = Number(prefs.width) || WIDGET_WIDTH_FULL
    if (fullWidth < WIDGET_WIDTH_FULL_MIN) fullWidth = WIDGET_WIDTH_FULL
    const compactWidth = Number(prefs.compactWidth) || WIDGET_WIDTH_COMPACT
    return { fullWidth, compactWidth }
  }

  async _persistWidgetPosition() {
    const pos = this.position
    if (!pos || !this.rendered) return
    const prefs = game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI) ?? {}
    const { fullWidth, compactWidth } = this._resolveWidgetWidths(prefs)
    await game.settings.set(MODULE_ID, SETTING_KEYS.WIDGET_UI, {
      ...prefs,
      top: pos.top,
      left: pos.left,
      width: prefs.compact ? fullWidth : (pos.width >= WIDGET_WIDTH_COMPACT + 40 ? pos.width : fullWidth),
      compactWidth: prefs.compact ? pos.width : compactWidth
    })
  }

  _schedulePersistWidgetPosition() {
    clearTimeout(this._persistWidgetPositionTimer)
    this._persistWidgetPositionTimer = setTimeout(() => {
      this._persistWidgetPosition().catch((e) => console.error('FML | Widget position save failed', e))
    }, 300)
  }

  _onPosition(position) {
    super._onPosition(position)
    this._schedulePersistWidgetPosition()
  }

  async _applyWidgetLayout({ width, compact }) {
    const position = {
      top: this.position?.top,
      left: this.position?.left,
      width,
      height: this.position?.height
    }
    const frame = !compact
    const frameChanged = this._widgetFramed !== frame
    this._widgetFramed = frame
    await this.render(frameChanged, {
      position,
      window: { frame }
    })
    if (typeof this.setPosition === 'function') {
      await this.setPosition(position)
    }
    this.element?.classList.toggle('fml-gm-widget--compact', compact)
  }

  async _onToggleCompact() {
    const prefs = game.settings.get(MODULE_ID, SETTING_KEYS.WIDGET_UI) ?? {}
    const nextCompact = !prefs.compact
    const { fullWidth, compactWidth } = this._resolveWidgetWidths(prefs)

    let storedFullWidth = nextCompact && this.position?.width >= WIDGET_WIDTH_COMPACT + 40
      ? this.position.width
      : fullWidth
    if (!nextCompact && storedFullWidth < WIDGET_WIDTH_FULL_MIN) storedFullWidth = WIDGET_WIDTH_FULL

    await game.settings.set(MODULE_ID, SETTING_KEYS.WIDGET_UI, {
      ...prefs,
      compact: nextCompact,
      width: storedFullWidth,
      compactWidth
    })

    const targetWidth = nextCompact ? compactWidth : storedFullWidth
    await this._applyWidgetLayout({ width: targetWidth, compact: nextCompact })
  }

  async close(options = {}) {
    this._stopProgressTicker()
    this._trackMarqueeObserver?.disconnect()
    this._trackMarqueeObserver = null
    this._trackMarqueeObservedList = null
    this._clearCompactIdleFade()
    clearTimeout(this._persistWidgetPositionTimer)
    await this._persistWidgetPosition()
    await game.settings.set(MODULE_ID, SETTING_KEYS.WIDGET_VISIBLE, false)
    return super.close(options)
  }
}
