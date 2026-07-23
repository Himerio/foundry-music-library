import {
  MODULE_ID,
  MODULE_PATH,
  ROW_HEIGHT_PX,
  SETTING_KEYS,
  SORT_OPTIONS,
  VIRTUAL_OVERSCAN
} from '../constants.mjs'
import { canManageMusicLibrary } from '../utils/permissions.mjs'
import {
  scanMusicLibrary,
  getTrackIndex,
  getSortedTracks,
  collectTagChips,
  collectArtistChips
} from '../services/index-service.mjs'
import { uploadMp3Files } from '../services/upload-service.mjs'
import * as favoriteStore from '../services/favorite-store.mjs'
import * as playlistStore from '../services/playlist-store.mjs'
import { syncModulePlaylistToFoundry, deleteFoundryPlaylistForModule } from '../services/foundry-sync.mjs'
import { stopAllModulePlaylists } from '../services/playback-control.mjs'
import { downloadExportJson, pickAndImport } from '../services/import-export.mjs'
import {
  formatDuration,
  getDisplayLine,
  getTrackArtist,
  getTrackTitle,
  matchesSearchQuery
} from '../services/track-display.mjs'
import { getTrackUrl } from '../services/paths.mjs'
import { openMetadataEditor } from './metadata-editor-app.mjs'
import { openBulkMetadataEditor } from './bulk-metadata-editor-app.mjs'
import { GmPlaybackWidget, refreshGmPlaybackWidget } from './gm-playback-widget.mjs'
import { promptPlaylistName } from './playlist-name-dialog.mjs'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class MusicLibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options)
    this.selectedPlaylistId = options.selectedPlaylistId ?? ''
    this.scrollTop = 0
    this._playlistPanelScrollTop = 0
    this._playlistPanelScroller = null
    this._filterQuery = undefined
    this._playlistFilterQuery = ''
    this._playlistFilterRenderTimer = null
    this._uploadBusy = false
    this._uploadProgress = { phase: 'upload', done: 0, total: 0, currentLabel: '' }
    this._filterRenderTimer = null
    this._filterPersistTimer = null
    this._trackScroller = null
    this._virtualTrackList = []
    this._lastVirtualStartIdx = -1
    this._virtualScrollRaf = null
    this._previewPath = null
    this._previewAudio = null
    this._selectedPaths = new Set()
    this._selectionAnchor = null
    /** @type {{ type: string, path: string, playlistId?: string } | null} */
    this._activeDragPayload = null
    this._onTrackScroll = () => {
      const scroller = this._trackScroller
      if (!scroller || !this._virtualTrackList.length) return
      this.scrollTop = scroller.scrollTop
      const startIdx = this._getVirtualStartIdx(this.scrollTop)
      if (startIdx === this._lastVirtualStartIdx) return
      if (this._virtualScrollRaf) cancelAnimationFrame(this._virtualScrollRaf)
      this._virtualScrollRaf = requestAnimationFrame(() => {
        this._virtualScrollRaf = null
        this._patchVirtualScroll().catch((e) => console.error('FML | Virtual scroll update failed', e))
      })
    }
    this._onPlaylistPanelScroll = () => {
      const panel = this._playlistPanelScroller
      if (panel) this._playlistPanelScrollTop = panel.scrollTop
    }
  }

  async render(force = false, options = {}) {
    this._savePlaylistPanelScroll()
    return super.render(force, options)
  }

  static DEFAULT_OPTIONS = {
    id: 'fml-music-library',
    classes: ['fml-music-library-app'],
    tag: 'div',
    window: {
      title: 'FML.Library.Title',
      icon: 'fa-solid fa-music',
      resizable: true
    },
    position: { width: 960, height: 800 },
    actions: {
      scan: MusicLibraryApp.onScan,
      rescan: MusicLibraryApp.onRescan,
      export: MusicLibraryApp.onExport,
      import: MusicLibraryApp.onImport,
      openWidget: MusicLibraryApp.onOpenWidget,
      newPlaylist: MusicLibraryApp.onNewPlaylist,
      selectLibrary: MusicLibraryApp.onSelectLibrary,
      selectPlaylist: MusicLibraryApp.onSelectPlaylist,
      renamePlaylist: MusicLibraryApp.onRenamePlaylist,
      duplicatePlaylist: MusicLibraryApp.onDuplicatePlaylist,
      deletePlaylist: MusicLibraryApp.onDeletePlaylist,
      toggleSortDir: MusicLibraryApp.onToggleSortDir,
      addToPlaylist: MusicLibraryApp.onAddToPlaylist,
      editMetadata: MusicLibraryApp.onEditMetadata,
      removeFromPlaylist: MusicLibraryApp.onRemoveFromPlaylist,
      uploadTracks: MusicLibraryApp.onUploadTracks,
      toggleFavorite: MusicLibraryApp.onToggleFavorite,
      toggleTagFilter: MusicLibraryApp.onToggleTagFilter,
      clearTagFilter: MusicLibraryApp.onClearTagFilter,
      toggleFavoritesFilter: MusicLibraryApp.onToggleFavoritesFilter,
      toggleArtistFilter: MusicLibraryApp.onToggleArtistFilter,
      clearArtistFilter: MusicLibraryApp.onClearArtistFilter,
      toggleMissingMetadataFilter: MusicLibraryApp.onToggleMissingMetadataFilter,
      toggleTrackSelect: MusicLibraryApp.onToggleTrackSelect,
      selectAllVisible: MusicLibraryApp.onSelectAllVisible,
      clearSelection: MusicLibraryApp.onClearSelection,
      bulkEditMetadata: MusicLibraryApp.onBulkEditMetadata,
      addSelectionToPlaylist: MusicLibraryApp.onAddSelectionToPlaylist,
      trackScroll: MusicLibraryApp.onTrackScroll,
      togglePreview: MusicLibraryApp.onTogglePreview,
      stopPreview: MusicLibraryApp.onStopPreview
    }
  }

  static PARTS = {
    main: {
      template: `${MODULE_PATH}/templates/music-library.hbs`,
      scrollable: ['.fml-virtual-scroll']
    }
  }

  static open(options = {}) {
    if (!canManageMusicLibrary()) {
      ui.notifications.warn(game.i18n.localize('FML.Common.NoPermission'))
      return null
    }
    const existing = foundry.applications.instances?.get('fml-music-library')
    if (existing) {
      existing.render(false)
      return existing
    }
    const uiPrefs = game.settings.get(MODULE_ID, SETTING_KEYS.LIBRARY_UI) ?? {}
    const app = new MusicLibraryApp(options)
    app.render(true, { position: uiPrefs })
    return app
  }

  async _prepareContext() {
    const sortBy = game.settings.get(MODULE_ID, SETTING_KEYS.SORT_BY)
    const sortDir = game.settings.get(MODULE_ID, SETTING_KEYS.SORT_DIR)
    if (this._filterQuery === undefined) {
      this._filterQuery = game.settings.get(MODULE_ID, SETTING_KEYS.FILTER_QUERY) ?? ''
    }
    const filterQuery = this._filterQuery
    const activeTags = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS) ?? []
    const activeArtists = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_ARTISTS) ?? []
    const favoritesOnly = game.settings.get(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY) ?? false
    const missingMetadataOnly = game.settings.get(MODULE_ID, SETTING_KEYS.MISSING_METADATA_ONLY) ?? false
    const allTracks = getSortedTracks(sortBy, sortDir, filterQuery, {
      tagFilter: activeTags,
      artistFilter: activeArtists,
      favoriteOnly: favoritesOnly,
      missingMetadataOnly
    })
    const index = getTrackIndex()
    const missingCount = Object.values(index).filter((t) => t.missing).length
    const playlists = playlistStore.getPlaylists()
    const selectedPlaylist = this.selectedPlaylistId
      ? playlistStore.getPlaylistById(this.selectedPlaylistId)
      : null

    const playlistFilterQuery = this._playlistFilterQuery ?? ''
    const playlistTracksAll = selectedPlaylist
      ? selectedPlaylist.trackPaths.map((path) => {
        const t = index[path]
        return {
          path,
          display: t ? getDisplayLine(t) : path,
          duration: t ? formatDuration(t.detected?.duration) : '—',
          missing: !t || t.missing,
          track: t ?? null
        }
      })
      : []

    const playlistTrackCountTotal = playlistTracksAll.length
    const playlistTracks = playlistFilterQuery.trim()
      ? playlistTracksAll.filter((row) => {
        if (row.track) return matchesSearchQuery(row.track, playlistFilterQuery)
        const q = playlistFilterQuery.trim().toLowerCase()
        return row.display.toLowerCase().includes(q) || row.path.toLowerCase().includes(q)
      })
      : playlistTracksAll
    const playlistTrackCountFiltered = playlistTracks.length
    const playlistHasTracks = playlistTrackCountTotal > 0
    const playlistReorderEnabled = !playlistFilterQuery.trim()
    const playlistTrackCountLabel = playlistFilterQuery.trim()
      ? game.i18n.format('FML.Library.PlaylistTrackCountFiltered', {
        filtered: playlistTrackCountFiltered,
        total: playlistTrackCountTotal
      })
      : game.i18n.format('FML.Library.PlaylistTrackCount', { count: playlistTrackCountTotal })

    this._virtualTrackList = allTracks
    const scrollerEl = this._trackScroller ?? this.element?.querySelector('.fml-virtual-scroll')
    const virtual = this._computeVirtualWindow(
      allTracks,
      this.scrollTop,
      scrollerEl?.clientHeight
    )
    const { visibleTracks, startIdx } = virtual
    this._lastVirtualStartIdx = startIdx

    const previewPath = this._previewPath

    const previewEntry = previewPath ? index[previewPath] : null
    const previewTrack = previewPath
      ? {
        path: previewPath,
        label: previewEntry ? getDisplayLine(previewEntry) : previewPath
      }
      : null

    const tagChips = collectTagChips().map((tag) => ({
      tag,
      active: activeTags.includes(tag)
    }))

    const artistChips = collectArtistChips().map((artist) => ({
      artist,
      active: activeArtists.includes(artist)
    }))

    const selectionCount = this._selectedPaths.size

    const sortLabels = {
      title: game.i18n.localize('FML.Track.Title'),
      artist: game.i18n.localize('FML.Track.Artist'),
      duration: game.i18n.localize('FML.Track.Duration'),
      createdAt: 'Created',
      updatedAt: 'Updated'
    }

    return {
      viewMode: selectedPlaylist ? 'playlist' : 'library',
      filterQuery,
      sortBy,
      sortDir,
      sortDirIcon: sortDir === 'desc' ? 'down-wide-short' : 'up-wide-short',
      sortOptions: SORT_OPTIONS.map((key) => ({ key, label: sortLabels[key] ?? key })),
      playlists,
      selectedPlaylistId: this.selectedPlaylistId,
      showAddToPlaylist: Boolean(this.selectedPlaylistId),
      selectedPlaylist,
      playlistTracks,
      playlistFilterQuery,
      playlistHasTracks,
      playlistTrackCountTotal,
      playlistTrackCountFiltered,
      playlistTrackCountLabel,
      playlistReorderEnabled,
      uploadBusy: this._uploadBusy,
      trackCount: Object.keys(index).length,
      emptyLibrary: allTracks.length === 0,
      missingCount,
      missingBanner: game.i18n.format('FML.Library.MissingTracks', { count: missingCount }),
      visibleTracks,
      virtualHeight: virtual.virtualHeight,
      virtualOffset: virtual.virtualOffset,
      activeTags,
      activeArtists,
      favoritesOnly,
      missingMetadataOnly,
      tagChips,
      artistChips,
      selectionCount,
      hasSelection: selectionCount > 0,
      previewTrack
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this._bindContextMenus()
    this._bindPlaylistDragDrop()
    this._bindLibraryDragDrop()
    this._bindUploadDropzone()
    this._bindUploadInput()
    this._bindKeyboard()
    this._bindSortSelect()
    this._bindFilterInput()
    this._bindPlaylistFilterInput()
    this._bindVirtualScroll()
    this._bindPlaylistPanelScroll()
    this._bindTrackSelection()
    this._syncScrollerScrollTop()
    this._syncPlaylistPanelScrollTop()
    if (this._uploadBusy) this._syncUploadOverlayDom()
  }

  _syncUploadOverlayDom() {
    const root = this.element?.querySelector('.fml-library')
    const overlay = root?.querySelector('.fml-upload-overlay')
    if (!root || !overlay) return
    root.classList.add('fml-upload-busy')
    overlay.hidden = false
    this._applyUploadOverlayProgress(overlay, this._uploadProgress)
  }

  _applyUploadOverlayProgress(overlay, state) {
    const { phase, done, total, currentLabel } = state
    const labelEl = overlay.querySelector('.fml-upload-overlay-label')
    const fileEl = overlay.querySelector('.fml-upload-overlay-file')
    const countEl = overlay.querySelector('.fml-upload-overlay-count')
    const fillEl = overlay.querySelector('.fml-upload-progress-fill')
    const percent = total > 0 ? Math.round((done / total) * 100) : 0

    if (labelEl) {
      labelEl.textContent = phase === 'scan'
        ? game.i18n.localize('FML.Upload.Scanning')
        : game.i18n.localize('FML.Upload.InProgress')
    }
    if (fileEl) fileEl.textContent = currentLabel ?? ''
    if (countEl) {
      countEl.textContent = game.i18n.format('FML.Upload.Progress', { done, total })
    }
    if (fillEl) fillEl.style.width = `${percent}%`
  }

  _showUploadOverlay(total) {
    this._uploadBusy = true
    this._uploadProgress = { phase: 'upload', done: 0, total, currentLabel: '' }
    const root = this.element?.querySelector('.fml-library')
    const overlay = root?.querySelector('.fml-upload-overlay')
    if (!root || !overlay) return
    root.classList.add('fml-upload-busy')
    overlay.hidden = false
    this._applyUploadOverlayProgress(overlay, this._uploadProgress)
  }

  _updateUploadOverlay(state) {
    this._uploadProgress = state
    const overlay = this.element?.querySelector('.fml-upload-overlay')
    if (overlay) this._applyUploadOverlayProgress(overlay, state)
  }

  _hideUploadOverlay() {
    this._uploadBusy = false
    const root = this.element?.querySelector('.fml-library')
    const overlay = root?.querySelector('.fml-upload-overlay')
    if (root) root.classList.remove('fml-upload-busy')
    if (overlay) overlay.hidden = true
  }

  async _runUpload(fileList) {
    if (!canManageMusicLibrary() || !fileList?.length) return
    if (this._uploadBusy) {
      ui.notifications.warn(game.i18n.localize('FML.Upload.Busy'))
      return
    }

    const files = [...fileList]
    this._showUploadOverlay(files.length)

    try {
      const result = await uploadMp3Files(files, {
        onProgress: (state) => this._updateUploadOverlay(state)
      })
      if (result.errors > 0 && result.uploaded === 0) {
        ui.notifications.error(game.i18n.localize('FML.Upload.Failed'))
      } else if (result.uploaded > 0) {
        ui.notifications.info(game.i18n.format('FML.Upload.Complete', result))
      } else if (result.skipped > 0) {
        ui.notifications.warn(game.i18n.format('FML.Upload.Skipped', result))
      }
    } catch (e) {
      console.error('FML | Upload batch failed', e)
      ui.notifications.error(game.i18n.localize('FML.Upload.Failed'))
    } finally {
      this._hideUploadOverlay()
      await this.render(false)
    }
  }

  _bindTrackSelection() {
    const panel = this.element?.querySelector('.fml-track-panel')
    if (!panel || panel.dataset.fmlSelBound) return
    panel.dataset.fmlSelBound = '1'

    panel.addEventListener('click', (event) => {
      const checkbox = event.target.closest('.fml-track-select[data-path]')
      if (!checkbox) return
      if (event.shiftKey) {
        event.preventDefault()
        this._toggleRangeSelection(checkbox.dataset.path)
        this.render(false)
        return
      }
      this._selectionAnchor = checkbox.dataset.path
    })
  }

  _toggleRangeSelection(path) {
    const anchor = this._selectionAnchor ?? path
    const paths = this._virtualTrackList.map((t) => t.path)
    const a = paths.indexOf(anchor)
    const b = paths.indexOf(path)
    if (a < 0 || b < 0) {
      this._togglePathSelection(path)
      return
    }
    const [from, to] = a < b ? [a, b] : [b, a]
    for (let i = from; i <= to; i++) this._selectedPaths.add(paths[i])
  }

  _togglePathSelection(path) {
    if (this._selectedPaths.has(path)) this._selectedPaths.delete(path)
    else this._selectedPaths.add(path)
  }

  _getVirtualStartIdx(scrollTop) {
    return Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - VIRTUAL_OVERSCAN)
  }

  _computeVirtualWindow(tracks, scrollTop, clientHeight) {
    const list = tracks ?? []
    const viewportRows = Math.ceil((clientHeight ?? 400) / ROW_HEIGHT_PX) + VIRTUAL_OVERSCAN * 2
    const startIdx = this._getVirtualStartIdx(scrollTop)
    const endIdx = Math.min(list.length, startIdx + viewportRows)
    const previewPath = this._previewPath

    const visibleTracks = list.slice(startIdx, endIdx).map((t) => ({
      path: t.path,
      artist: getTrackArtist(t),
      title: getTrackTitle(t),
      duration: formatDuration(t.detected?.duration),
      missing: t.missing,
      favorite: favoriteStore.isFavorite(t.path),
      previewing: previewPath === t.path,
      selected: this._selectedPaths.has(t.path)
    }))

    return {
      startIdx,
      visibleTracks,
      virtualHeight: list.length * ROW_HEIGHT_PX,
      virtualOffset: startIdx * ROW_HEIGHT_PX
    }
  }

  async _patchVirtualScroll() {
    const scroller = this._trackScroller
    if (!scroller || !this._virtualTrackList.length) return

    const scrollTop = scroller.scrollTop
    this.scrollTop = scrollTop
    const virtual = this._computeVirtualWindow(
      this._virtualTrackList,
      scrollTop,
      scroller.clientHeight
    )
    if (virtual.startIdx === this._lastVirtualStartIdx) return
    this._lastVirtualStartIdx = virtual.startIdx

    const html = await foundry.applications.handlebars.renderTemplate(
      `${MODULE_PATH}/templates/virtual-track-list-inner.hbs`,
      {
        ...virtual,
        showAddToPlaylist: Boolean(this.selectedPlaylistId)
      }
    )
    scroller.innerHTML = html
    scroller.scrollTop = scrollTop
  }

  _syncScrollerScrollTop() {
    const scroller = this._trackScroller ?? this.element?.querySelector('.fml-virtual-scroll')
    if (!scroller) return
    if (scroller.scrollTop !== this.scrollTop) scroller.scrollTop = this.scrollTop
    this._trackScroller = scroller
  }

  _resetVirtualScrollAnchor() {
    this._lastVirtualStartIdx = -1
  }

  _bindVirtualScroll() {
    const scroller = this.element?.querySelector('.fml-virtual-scroll')
    if (!scroller || scroller === this._trackScroller) return
    this._unbindVirtualScroll()
    this._trackScroller = scroller
    scroller.addEventListener('scroll', this._onTrackScroll, { passive: true })
  }

  _unbindVirtualScroll() {
    if (this._trackScroller) {
      this._trackScroller.removeEventListener('scroll', this._onTrackScroll)
    }
    this._trackScroller = null
  }

  _savePlaylistPanelScroll() {
    const panel = this._playlistPanelScroller ?? this.element?.querySelector('.fml-playlist-panel')
    if (panel) this._playlistPanelScrollTop = panel.scrollTop
  }

  _bindPlaylistPanelScroll() {
    const panel = this.element?.querySelector('.fml-playlist-panel')
    if (!panel || panel === this._playlistPanelScroller) return
    this._unbindPlaylistPanelScroll()
    this._playlistPanelScroller = panel
    panel.addEventListener('scroll', this._onPlaylistPanelScroll, { passive: true })
  }

  _syncPlaylistPanelScrollTop() {
    const panel = this._playlistPanelScroller ?? this.element?.querySelector('.fml-playlist-panel')
    if (!panel) return
    if (panel.scrollTop !== this._playlistPanelScrollTop) {
      panel.scrollTop = this._playlistPanelScrollTop
    }
    this._playlistPanelScroller = panel
  }

  _unbindPlaylistPanelScroll() {
    if (this._playlistPanelScroller) {
      this._playlistPanelScroller.removeEventListener('scroll', this._onPlaylistPanelScroll)
    }
    this._playlistPanelScroller = null
  }

  async close(options = {}) {
    this._stopPreview({ render: false })
    clearTimeout(this._filterRenderTimer)
    clearTimeout(this._filterPersistTimer)
    if (this._virtualScrollRaf) cancelAnimationFrame(this._virtualScrollRaf)
    this._virtualScrollRaf = null
    this._unbindVirtualScroll()
    this._unbindPlaylistPanelScroll()
    if (this._filterQuery !== undefined) {
      const stored = game.settings.get(MODULE_ID, SETTING_KEYS.FILTER_QUERY) ?? ''
      if (this._filterQuery !== stored) {
        await game.settings.set(MODULE_ID, SETTING_KEYS.FILTER_QUERY, this._filterQuery)
      }
    }
    const pos = this.position
    if (pos) {
      await game.settings.set(MODULE_ID, SETTING_KEYS.LIBRARY_UI, {
        width: pos.width,
        height: pos.height,
        top: pos.top,
        left: pos.left
      })
    }
    return super.close(options)
  }

  _bindContextMenus() {
    const panel = this.element?.querySelector('.fml-track-panel')
    if (!panel || panel.dataset.fmlCtxBound) return
    panel.dataset.fmlCtxBound = '1'

    const ContextMenu = foundry.applications.ux.ContextMenu.implementation
    this._trackContextMenu = new ContextMenu(
      panel,
      '.fml-track-row[data-path]',
      [],
      {
        jQuery: false,
        onOpen: (target) => {
          const path = target.closest('.fml-track-row[data-path]')?.dataset?.path
          if (!path || !ui.context) return
          ui.context.menuItems = this._trackContextItems(path)
        }
      }
    )
  }

  _trackContextItems(path) {
    const isPreviewing = this._previewPath === path
    const items = [
      {
        name: game.i18n.localize(isPreviewing ? 'FML.Track.StopPreview' : 'FML.Track.PlayPreview'),
        icon: isPreviewing
          ? '<i class="fa-solid fa-stop"></i>'
          : '<i class="fa-solid fa-play"></i>',
        callback: () => (isPreviewing ? this._stopPreview() : this._playPreview(path))
      },
      {
        name: game.i18n.localize('FML.Track.EditMetadata'),
        icon: '<i class="fa-solid fa-pen"></i>',
        callback: () => openMetadataEditor(path, () => this.render(false))
      },
      ...(this._selectedPaths.size >= 1
        ? [{
          name: game.i18n.format('FML.Bulk.EditContext', { count: this._selectedPaths.size }),
          icon: '<i class="fa-solid fa-pen-to-square"></i>',
          callback: () => openBulkMetadataEditor([...this._selectedPaths], () => this.render(false))
        }]
        : []),
      {
        name: game.i18n.localize('FML.Track.CopyFilename'),
        icon: '<i class="fa-solid fa-copy"></i>',
        callback: () => {
          const t = getTrackIndex()[path]
          if (t) navigator.clipboard.writeText(t.filename)
        }
      }
    ]
    if (this.selectedPlaylistId) {
      items.unshift({
        name: game.i18n.localize('FML.Track.AddToPlaylist'),
        icon: '<i class="fa-solid fa-plus"></i>',
        callback: async () => {
          await playlistStore.addTrackToPlaylist(this.selectedPlaylistId, path)
          await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(this.selectedPlaylistId))
          this.render(false)
        }
      })
    } else {
      const subs = playlistStore.getPlaylists().map((pl) => ({
        name: pl.name,
        callback: async () => {
          await playlistStore.addTrackToPlaylist(pl.id, path)
          await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(pl.id))
          this.render(false)
        }
      }))
      if (subs.length) {
        items.unshift({
          name: game.i18n.localize('FML.Track.AddToPlaylist'),
          icon: '<i class="fa-solid fa-list"></i>',
          childEntries: subs
        })
      }
    }
    return items
  }

  _stopPreview({ render = true } = {}) {
    if (this._previewAudio) {
      this._previewAudio.pause()
      this._previewAudio.removeAttribute('src')
      this._previewAudio.load()
    }
    this._previewAudio = null
    this._previewPath = null
    if (game.musicLibrary) game.musicLibrary._preview = null
    if (render && this.rendered) this.render(false)
  }

  _playPreview(path) {
    this._stopPreview({ render: false })
    const audio = new Audio(getTrackUrl(path))
    audio.volume = 0.5
    this._previewAudio = audio
    this._previewPath = path
    if (game.musicLibrary) game.musicLibrary._preview = audio
    audio.addEventListener('ended', () => this._stopPreview(), { once: true })
    audio.addEventListener('error', () => {
      ui.notifications.warn(game.i18n.localize('FML.Common.Error'))
      this._stopPreview()
    }, { once: true })
    audio.play()
      .then(() => { if (this.rendered) this.render(false) })
      .catch((e) => {
        console.error('FML | Preview playback failed', e)
        ui.notifications.warn(game.i18n.localize('FML.Common.Error'))
        this._stopPreview()
      })
  }

  _bindKeyboard() {
    if (this.element.dataset.kbBound) return
    this.element.dataset.kbBound = '1'
    this.element.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.key === 'f') {
        ev.preventDefault()
        this.element.querySelector('input[name="filterQuery"]')?.focus()
      }
    })
  }

  _parseDragPayload(event) {
    try {
      const raw = event.dataTransfer.getData('text/plain')
      if (!raw) return this._activeDragPayload
      return JSON.parse(raw)
    } catch {
      return this._activeDragPayload
    }
  }

  _setDragPayload(event, payload) {
    const json = JSON.stringify(payload)
    event.dataTransfer.effectAllowed = payload.type === 'fml-library-track' ? 'copy' : 'move'
    event.dataTransfer.setData('text/plain', json)
    this._activeDragPayload = payload
  }

  _clearDragState() {
    this._activeDragPayload = null
    this._clearLibraryDropTargets()
  }

  _dropEffectForDrag() {
    return this._activeDragPayload?.type === 'fml-library-track' ? 'copy' : 'move'
  }

  _clearLibraryDropTargets() {
    this.element?.querySelectorAll('.fml-drop-target, .drop-target').forEach((el) => {
      el.classList.remove('fml-drop-target', 'drop-target')
    })
  }

  async _dropLibraryTrackOnPlaylist(playlistId, trackPath, insertIndex) {
    if (!playlistId || !trackPath || !canManageMusicLibrary()) return
    const pl = playlistStore.getPlaylistById(playlistId)
    if (!pl) return
    const already = pl.trackPaths.includes(trackPath)
    await playlistStore.insertTrackIntoPlaylist(playlistId, trackPath, insertIndex)
    await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(playlistId))
    if (!already) {
      ui.notifications.info(game.i18n.localize('FML.Library.TrackAddedToPlaylist'))
    }
    await this.render(false)
  }

  _bindLibraryDragDrop() {
    const root = this.element
    if (!root || root.dataset.fmlLibDndBound) return
    root.dataset.fmlLibDndBound = '1'
    const app = this

    root.addEventListener('dragstart', (event) => {
      if (!canManageMusicLibrary()) return
      const row = event.target.closest('.fml-track-row[data-path]')
      if (!row) return
      if (
        event.target.closest('button, input, select, a, label')
        && !event.target.closest('.fml-drag-handle')
      ) return
      const path = row.dataset.path
      app._setDragPayload(event, { type: 'fml-library-track', path })
      row.classList.add('fml-dragging')
    })

    root.addEventListener('dragend', () => {
      root.querySelectorAll('.fml-track-row.fml-dragging').forEach((el) => el.classList.remove('fml-dragging'))
      app._clearDragState()
    })

    const sidebar = root.querySelector('.fml-playlist-list')
    if (sidebar && !sidebar.dataset.fmlSidebarDndBound) {
      sidebar.dataset.fmlSidebarDndBound = '1'

      sidebar.addEventListener('dragover', (event) => {
        if (app._activeDragPayload?.type !== 'fml-library-track') return
        const item = event.target.closest('.fml-playlist-item')
        if (!item) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        app._clearLibraryDropTargets()
        item.classList.add('fml-drop-target')
      })

      sidebar.addEventListener('dragleave', (event) => {
        const item = event.target.closest('.fml-playlist-item')
        if (item && !item.contains(event.relatedTarget)) item.classList.remove('fml-drop-target')
      })

      sidebar.addEventListener('drop', async (event) => {
        event.preventDefault()
        app._clearDragState()
        if (!canManageMusicLibrary()) return
        const item = event.target.closest('.fml-playlist-item')
        const btn = item?.querySelector('button[data-playlist-id]')
        const data = app._parseDragPayload(event)
        if (!btn || data?.type !== 'fml-library-track') return
        await app._dropLibraryTrackOnPlaylist(btn.dataset.playlistId, data.path)
      })
    }
  }

  _bindPlaylistDragDrop() {
    const panel = this.element?.querySelector('.fml-playlist-panel')
    if (!panel || !this.selectedPlaylistId) return

    const list = panel.querySelector('.fml-playlist-tracks')
    const playlistId = this.selectedPlaylistId
    const app = this

    const clearDropStyles = () => {
      list?.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'))
      panel.querySelectorAll('.fml-playlist-drop-zone.fml-drop-target').forEach((el) => {
        el.classList.remove('fml-drop-target')
      })
    }

    const emptyZone = panel.querySelector('.fml-playlist-drop-zone')
    if (emptyZone && !emptyZone.dataset.fmlDndBound) {
      emptyZone.dataset.fmlDndBound = '1'
      emptyZone.addEventListener('dragover', (event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        emptyZone.classList.add('fml-drop-target')
      })
      emptyZone.addEventListener('dragleave', (event) => {
        if (!emptyZone.contains(event.relatedTarget)) emptyZone.classList.remove('fml-drop-target')
      })
      emptyZone.addEventListener('drop', async (event) => {
        event.preventDefault()
        clearDropStyles()
        app._clearDragState()
        const data = app._parseDragPayload(event)
        if (data?.type !== 'fml-library-track') return
        await app._dropLibraryTrackOnPlaylist(playlistId, data.path)
      })
    }

    if (!list || list.dataset.fmlDndBound) {
      if (!list) return
      return
    }
    list.dataset.fmlDndBound = '1'

    list.addEventListener('dragstart', (event) => {
      if (!canManageMusicLibrary()) return
      if (app._playlistFilterQuery?.trim()) return
      const li = event.target.closest('li[data-path]')
      if (!li || event.target.closest('button, input, select, a')) return
      const path = li.dataset.path
      app._setDragPayload(event, { type: 'fml-playlist-track', path, playlistId })
      li.classList.add('dragging')
    })

    list.addEventListener('dragend', (event) => {
      event.target.closest('li[data-path]')?.classList.remove('dragging')
      app._clearDragState()
      clearDropStyles()
    })

    list.addEventListener('dragover', (event) => {
      const isLibraryDrag = app._activeDragPayload?.type === 'fml-library-track'
      const li = event.target.closest('li[data-path]')
      if (!isLibraryDrag && !li) return
      event.preventDefault()
      event.dataTransfer.dropEffect = app._dropEffectForDrag()
      clearDropStyles()
      if (li) li.classList.add('drop-target')
      else list.classList.add('fml-drop-target')
    })

    list.addEventListener('dragleave', (event) => {
      const li = event.target.closest('li[data-path]')
      if (li && !li.contains(event.relatedTarget)) li.classList.remove('drop-target')
      if (!list.contains(event.relatedTarget)) list.classList.remove('fml-drop-target')
    })

    list.addEventListener('drop', async (event) => {
      event.preventDefault()
      clearDropStyles()
      app._clearDragState()
      if (!canManageMusicLibrary()) return

      const data = app._parseDragPayload(event)
      if (!data) return

      const pl = playlistStore.getPlaylistById(playlistId)
      if (!pl) return

      if (data.type === 'fml-library-track') {
        const targetLi = event.target.closest('li[data-path]')
        let insertIndex = pl.trackPaths.length
        if (targetLi) {
          const idx = pl.trackPaths.indexOf(targetLi.dataset.path)
          if (idx >= 0) insertIndex = idx
        }
        await app._dropLibraryTrackOnPlaylist(playlistId, data.path, insertIndex)
        return
      }

      if (data.type !== 'fml-playlist-track' || data.playlistId !== playlistId) return
      if (app._playlistFilterQuery?.trim()) return

      const targetLi = event.target.closest('li[data-path]')
      if (!targetLi) return

      const fromIndex = pl.trackPaths.indexOf(data.path)
      const targetIndex = pl.trackPaths.indexOf(targetLi.dataset.path)
      if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return

      let toIndex = targetIndex
      if (fromIndex < targetIndex) toIndex = targetIndex - 1

      const updated = await playlistStore.reorderPlaylistTracks(playlistId, fromIndex, toIndex)
      if (!updated) return
      await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(playlistId))
      app.render(false)
    })
  }

  _bindUploadDropzone() {
    const root = this.element?.querySelector('[data-upload-dropzone]')
    if (!root || root.dataset.uploadBound) return
    root.dataset.uploadBound = '1'

    const handleFiles = async (fileList) => {
      await this._runUpload(fileList)
    }

    const isFileDrag = (event) => {
      if (this._uploadBusy) return false
      const types = event.dataTransfer?.types
      if (!types) return false
      return typeof types.includes === 'function'
        ? types.includes('Files')
        : [...types].includes('Files')
    }

    const setUploadHover = (active) => {
      root.classList.toggle('fml-upload-hover', active)
    }

    root.addEventListener('dragenter', (event) => {
      if (!canManageMusicLibrary() || !isFileDrag(event)) return
      setUploadHover(true)
    })
    root.addEventListener('dragover', (event) => {
      if (!canManageMusicLibrary() || !isFileDrag(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setUploadHover(true)
    })
    root.addEventListener('dragleave', (event) => {
      if (!root.contains(event.relatedTarget)) setUploadHover(false)
    })
    root.addEventListener('drop', async (event) => {
      setUploadHover(false)
      if (!isFileDrag(event)) return
      event.preventDefault()
      await handleFiles(event.dataTransfer?.files)
    })
    window.addEventListener('dragend', () => setUploadHover(false))
    this._uploadHandler = handleFiles
  }

  _bindSortSelect() {
    const select = this.element?.querySelector('select[name="sortBy"]')
    if (!select || select.dataset.fmlBound) return
    select.dataset.fmlBound = '1'
    select.addEventListener('change', async (ev) => {
      const value = ev.currentTarget.value
      if (!value) return
      await game.settings.set(MODULE_ID, SETTING_KEYS.SORT_BY, value)
      this.scrollTop = 0
      this._lastVirtualStartIdx = -1
      await this.render(false)
    })
  }

  _bindFilterInput() {
    const input = this.element?.querySelector('input[name="filterQuery"]')
    if (!input || input.dataset.fmlBound) return
    input.dataset.fmlBound = '1'

    const applyFilter = async (value, selection) => {
      if (value === this._filterQuery) return
      this._filterQuery = value
      this.scrollTop = 0
      this._lastVirtualStartIdx = -1
      await this.render(false)
      this._restoreFilterFocus(selection)
    }

    input.addEventListener('input', () => {
      const value = input.value
      const selection = { start: input.selectionStart, end: input.selectionEnd }

      clearTimeout(this._filterRenderTimer)
      this._filterRenderTimer = setTimeout(() => {
        applyFilter(value, selection).catch((e) => console.error('FML | Filter render failed', e))
      }, 200)

      clearTimeout(this._filterPersistTimer)
      this._filterPersistTimer = setTimeout(() => {
        const stored = game.settings.get(MODULE_ID, SETTING_KEYS.FILTER_QUERY) ?? ''
        if (stored !== value) {
          game.settings.set(MODULE_ID, SETTING_KEYS.FILTER_QUERY, value)
            .catch((e) => console.error('FML | Filter save failed', e))
        }
      }, 600)
    })

    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return
      ev.preventDefault()
      clearTimeout(this._filterRenderTimer)
      clearTimeout(this._filterPersistTimer)
      const value = input.value
      const selection = { start: input.selectionStart, end: input.selectionEnd }
      applyFilter(value, selection)
        .then(() => game.settings.set(MODULE_ID, SETTING_KEYS.FILTER_QUERY, value))
        .catch((e) => console.error('FML | Filter apply failed', e))
    })
  }

  _bindPlaylistFilterInput() {
    const input = this.element?.querySelector('input[name="playlistFilterQuery"]')
    if (!input || input.dataset.fmlBound) return
    input.dataset.fmlBound = '1'

    const applyFilter = async (value, selection) => {
      if (value === this._playlistFilterQuery) return
      this._playlistFilterQuery = value
      await this.render(false)
      this._restoreSearchFocus('input[name="playlistFilterQuery"]', selection)
    }

    input.addEventListener('input', () => {
      const value = input.value
      const selection = { start: input.selectionStart, end: input.selectionEnd }
      clearTimeout(this._playlistFilterRenderTimer)
      this._playlistFilterRenderTimer = setTimeout(() => {
        applyFilter(value, selection).catch((e) => console.error('FML | Playlist filter render failed', e))
      }, 200)
    })

    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return
      ev.preventDefault()
      clearTimeout(this._playlistFilterRenderTimer)
      const value = input.value
      const selection = { start: input.selectionStart, end: input.selectionEnd }
      applyFilter(value, selection).catch((e) => console.error('FML | Playlist filter apply failed', e))
    })
  }

  _restoreFilterFocus(selection) {
    this._restoreSearchFocus('input[name="filterQuery"]', selection)
  }

  _restoreSearchFocus(selector, selection) {
    const el = this.element?.querySelector(selector)
    if (!el) return
    el.focus()
    if (selection && Number.isFinite(selection.start) && Number.isFinite(selection.end)) {
      try {
        el.setSelectionRange(selection.start, selection.end)
      } catch {
        /* input type may reject selection in edge cases */
      }
    }
  }

  static async onScan() {
    const app = this
    const result = await scanMusicLibrary({ forceMetadata: false })
    ui.notifications.info(game.i18n.format('FML.Library.ScanComplete', result))
    app.render(false)
  }

  static async onRescan() {
    const app = this
    const result = await scanMusicLibrary({ forceMetadata: true })
    ui.notifications.info(game.i18n.format('FML.Library.ScanComplete', result))
    app.render(false)
  }

  static onExport() {
    downloadExportJson()
  }

  static async onImport() {
    const app = this
    const DialogV2 = foundry.applications.api.DialogV2
    if (DialogV2?.wait) {
      const result = await DialogV2.wait({
        window: { title: game.i18n.localize('FML.Import.Title') },
        content: `<p>${game.i18n.localize('FML.Import.Mode')}</p>
          <select name="mode" style="width:100%">
            <option value="merge">${game.i18n.localize('FML.Import.Merge')}</option>
            <option value="replace">${game.i18n.localize('FML.Import.Replace')}</option>
            <option value="metadata-only">${game.i18n.localize('FML.Import.MetadataOnly')}</option>
            <option value="playlists-only">${game.i18n.localize('FML.Import.PlaylistsOnly')}</option>
          </select>`,
        buttons: [
          { action: 'ok', label: game.i18n.localize('FML.Common.Confirm'), default: true },
          { action: 'cancel', label: game.i18n.localize('FML.Common.Cancel') }
        ]
      })
      if (result !== 'ok') return
      const select = document.querySelector('select[name="mode"]')
      const mode = select?.value ?? 'merge'
      try {
        const imp = await pickAndImport(mode)
        if (imp?.warnings?.length) {
          ui.notifications.warn(game.i18n.localize('FML.Import.Warnings'))
        }
        app.render(false)
      } catch (e) {
        console.error(e)
        ui.notifications.error(game.i18n.localize('FML.Common.Error'))
      }
      return
    }
    await pickAndImport('merge')
    app.render(false)
  }

  static onOpenWidget() {
    GmPlaybackWidget.open()
  }

  static onUploadTracks() {
    if (this._uploadBusy) {
      ui.notifications.warn(game.i18n.localize('FML.Upload.Busy'))
      return
    }
    this.element?.querySelector('.fml-upload-input')?.click()
  }

  _bindUploadInput() {
    const input = this.element?.querySelector('.fml-upload-input')
    if (!input || input.dataset.fmlBound) return
    input.dataset.fmlBound = '1'
    input.addEventListener('change', async (event) => {
      const files = event.target?.files
      if (!files?.length) return
      if (this._uploadHandler) await this._uploadHandler(files)
      event.target.value = ''
    })
  }

  static async onToggleFavorite(event, target) {
    const path = MusicLibraryApp._pathFromActionTarget(target)
    if (!path) return
    await favoriteStore.toggleFavorite(path)
    await this.render(false)
  }

  static async onToggleTagFilter(event, target) {
    const tag = target.dataset?.tag
    if (!tag) return
    const active = [...(game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS) ?? [])]
    const idx = active.indexOf(tag)
    if (idx >= 0) active.splice(idx, 1)
    else active.push(tag)
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS, active)
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static async onClearTagFilter() {
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS, [])
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static async onToggleFavoritesFilter() {
    const cur = game.settings.get(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY) ?? false
    await game.settings.set(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY, !cur)
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static async onToggleArtistFilter(event, target) {
    const artist = target.dataset?.artist
    if (!artist) return
    const active = [...(game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_ARTISTS) ?? [])]
    const idx = active.indexOf(artist)
    if (idx >= 0) active.splice(idx, 1)
    else active.push(artist)
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_ARTISTS, active)
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static async onClearArtistFilter() {
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_ARTISTS, [])
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static async onToggleMissingMetadataFilter() {
    const cur = game.settings.get(MODULE_ID, SETTING_KEYS.MISSING_METADATA_ONLY) ?? false
    await game.settings.set(MODULE_ID, SETTING_KEYS.MISSING_METADATA_ONLY, !cur)
    this.scrollTop = 0
    this._resetVirtualScrollAnchor()
    await this.render(false)
  }

  static onToggleTrackSelect(event, target) {
    const path = MusicLibraryApp._pathFromActionTarget(target)
    if (!path) return
    if (event.shiftKey) {
      event.preventDefault()
      this._toggleRangeSelection(path)
    } else {
      if (target.checked) this._selectedPaths.add(path)
      else this._selectedPaths.delete(path)
      this._selectionAnchor = path
    }
    this.render(false)
  }

  static onSelectAllVisible() {
    const virtual = this._computeVirtualWindow(
      this._virtualTrackList,
      this.scrollTop,
      this._trackScroller?.clientHeight
    )
    for (const row of virtual.visibleTracks) this._selectedPaths.add(row.path)
    this.render(false)
  }

  static onClearSelection() {
    this._selectedPaths.clear()
    this._selectionAnchor = null
    this.render(false)
  }

  static onBulkEditMetadata() {
    if (!this._selectedPaths.size) return
    openBulkMetadataEditor([...this._selectedPaths], () => this.render(false))
  }

  static async onAddSelectionToPlaylist() {
    const app = this
    if (!app.selectedPlaylistId) {
      ui.notifications.warn(game.i18n.localize('FML.Library.SelectPlaylist'))
      return
    }
    if (!app._selectedPaths.size) return

    const sortBy = game.settings.get(MODULE_ID, SETTING_KEYS.SORT_BY)
    const sortDir = game.settings.get(MODULE_ID, SETTING_KEYS.SORT_DIR)
    const filterQuery = app._filterQuery ?? game.settings.get(MODULE_ID, SETTING_KEYS.FILTER_QUERY) ?? ''
    const activeTags = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_TAGS) ?? []
    const activeArtists = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_ARTISTS) ?? []
    const favoritesOnly = game.settings.get(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY) ?? false
    const missingMetadataOnly = game.settings.get(MODULE_ID, SETTING_KEYS.MISSING_METADATA_ONLY) ?? false

    const orderedPaths = getSortedTracks(sortBy, sortDir, filterQuery, {
      tagFilter: activeTags,
      artistFilter: activeArtists,
      favoriteOnly: favoritesOnly,
      missingMetadataOnly
    })
      .filter((t) => app._selectedPaths.has(t.path))
      .map((t) => t.path)

    const pl = playlistStore.getPlaylistById(app.selectedPlaylistId)
    const existing = new Set(pl?.trackPaths ?? [])
    let added = 0
    for (const path of orderedPaths) {
      if (existing.has(path)) continue
      await playlistStore.addTrackToPlaylist(app.selectedPlaylistId, path)
      existing.add(path)
      added += 1
    }
    const skipped = orderedPaths.length - added

    await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(app.selectedPlaylistId))
    ui.notifications.info(game.i18n.format('FML.Bulk.AddedToPlaylist', { added, skipped }))
    app.render(false)
  }

  static async onNewPlaylist() {
    const app = this
    const name = await promptPlaylistName({
      title: game.i18n.localize('FML.Library.NewPlaylist'),
      defaultValue: 'Playlist'
    })
    if (!name) return
    const pl = await playlistStore.createModulePlaylist(name)
    await syncModulePlaylistToFoundry(pl)
    app.selectedPlaylistId = pl.id
    app.render(false)
    refreshGmPlaybackWidget()
  }

  static onSelectLibrary() {
    this.selectedPlaylistId = ''
    this._playlistFilterQuery = ''
    this._playlistPanelScrollTop = 0
    this.render(false)
  }

  static onSelectPlaylist(event, target) {
    this.selectedPlaylistId = target.closest('[data-playlist-id]')?.dataset?.playlistId ?? ''
    this._playlistFilterQuery = ''
    this._playlistPanelScrollTop = 0
    this.render(false)
  }

  static async onRenamePlaylist() {
    const app = this
    const pl = playlistStore.getPlaylistById(app.selectedPlaylistId)
    if (!pl) return
    const name = await promptPlaylistName({
      title: game.i18n.localize('FML.Library.RenamePlaylist'),
      defaultValue: pl.name
    })
    if (!name) return
    await playlistStore.renameModulePlaylist(pl.id, name)
    await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(pl.id))
    app.render(false)
    refreshGmPlaybackWidget()
  }

  static async onDuplicatePlaylist() {
    const app = this
    const copy = await playlistStore.duplicateModulePlaylist(app.selectedPlaylistId)
    if (copy) {
      await syncModulePlaylistToFoundry(copy)
      app.selectedPlaylistId = copy.id
      app.render(false)
      refreshGmPlaybackWidget()
    }
  }

  static async onDeletePlaylist() {
    const app = this
    const pl = playlistStore.getPlaylistById(app.selectedPlaylistId)
    if (!pl) return
    const D2 = foundry.applications.api.DialogV2
    let confirmed = true
    if (D2?.confirm) {
      confirmed = await D2.confirm({
        window: { title: game.i18n.localize('FML.Library.DeletePlaylist') },
        content: `<p>${pl.name}?</p>`
      })
    } else if (!window.confirm(`${pl.name}?`)) {
      confirmed = false
    }
    if (!confirmed) return
    const deletedId = pl.id
    await stopAllModulePlaylists()
    await deleteFoundryPlaylistForModule(pl)
    await playlistStore.deleteModulePlaylist(deletedId)
    const remaining = playlistStore.getPlaylists()
    const currentActive = game.settings.get(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID)
    const nextActive = remaining.find((p) => p.id === currentActive && p.id !== deletedId)?.id
      ?? remaining[0]?.id
      ?? ''
    await game.settings.set(MODULE_ID, SETTING_KEYS.ACTIVE_MODULE_PLAYLIST_ID, nextActive)
    app.selectedPlaylistId = ''
    app.render(false)
    await refreshGmPlaybackWidget()
  }

  static async onToggleSortDir() {
    const cur = game.settings.get(MODULE_ID, SETTING_KEYS.SORT_DIR)
    await game.settings.set(MODULE_ID, SETTING_KEYS.SORT_DIR, cur === 'asc' ? 'desc' : 'asc')
    this.render(false)
  }

  static async onAddToPlaylist(event, target) {
    const app = this
    const path = target.closest('[data-path]')?.dataset?.path
    if (!path) return
    if (!app.selectedPlaylistId) {
      ui.notifications.warn(game.i18n.localize('FML.Library.SelectPlaylist'))
      return
    }
    await playlistStore.addTrackToPlaylist(app.selectedPlaylistId, path)
    await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(app.selectedPlaylistId))
    app.render(false)
  }

  static onEditMetadata(event, target) {
    const path = MusicLibraryApp._pathFromActionTarget(target)
    if (path) openMetadataEditor(path, () => this.render(false))
  }

  static _pathFromActionTarget(target) {
    return target?.closest?.('[data-path]')?.dataset?.path ?? null
  }

  static async onRemoveFromPlaylist(event, target) {
    const path = MusicLibraryApp._pathFromActionTarget(target)
    if (!path || !this.selectedPlaylistId) return
    await playlistStore.removeTrackFromPlaylist(this.selectedPlaylistId, path)
    await syncModulePlaylistToFoundry(playlistStore.getPlaylistById(this.selectedPlaylistId))
    this.render(false)
  }

  static onTrackScroll() {
    /* scroll handled via listener in _onRender */
  }

  static onStopPreview() {
    this._stopPreview()
  }

  static onTogglePreview(event, target) {
    const path = MusicLibraryApp._pathFromActionTarget(target)
    if (!path) return
    if (this._previewPath === path) this._stopPreview()
    else this._playPreview(path)
  }
}
