import {
  MODULE_ID,
  MODULE_PATH,
  ROW_HEIGHT_PX,
  SETTING_KEYS,
  SORT_OPTIONS,
  VIRTUAL_OVERSCAN
} from '../constants.mjs'
import { canManageMusicLibrary } from '../utils/permissions.mjs'
import { scanMusicLibrary, getTrackIndex, getSortedTracks, collectTagChips } from '../services/index-service.mjs'
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
  getTrackTitle
} from '../services/track-display.mjs'
import { getTrackUrl } from '../services/paths.mjs'
import { openMetadataEditor } from './metadata-editor-app.mjs'
import { GmPlaybackWidget, refreshGmPlaybackWidget } from './gm-playback-widget.mjs'
import { promptPlaylistName } from './playlist-name-dialog.mjs'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class MusicLibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options)
    this.selectedPlaylistId = options.selectedPlaylistId ?? ''
    this.scrollTop = 0
    this._filterQuery = undefined
    this._filterRenderTimer = null
    this._filterPersistTimer = null
    this._trackScroller = null
    this._virtualTrackList = []
    this._lastVirtualStartIdx = -1
    this._virtualScrollRaf = null
    this._previewPath = null
    this._previewAudio = null
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
    position: { width: 960, height: 640 },
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
    const favoritesOnly = game.settings.get(MODULE_ID, SETTING_KEYS.FAVORITES_ONLY) ?? false
    const allTracks = getSortedTracks(sortBy, sortDir, filterQuery, {
      tagFilter: activeTags,
      favoriteOnly: favoritesOnly
    })
    const index = getTrackIndex()
    const missingCount = Object.values(index).filter((t) => t.missing).length
    const playlists = playlistStore.getPlaylists()
    const selectedPlaylist = this.selectedPlaylistId
      ? playlistStore.getPlaylistById(this.selectedPlaylistId)
      : null

    const playlistTracks = selectedPlaylist
      ? selectedPlaylist.trackPaths.map((path) => {
        const t = index[path]
        return {
          path,
          display: t ? getDisplayLine(t) : path,
          duration: t ? formatDuration(t.detected?.duration) : '—',
          missing: !t || t.missing
        }
      })
      : []

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
      trackCount: Object.keys(index).length,
      emptyLibrary: allTracks.length === 0,
      missingCount,
      missingBanner: game.i18n.format('FML.Library.MissingTracks', { count: missingCount }),
      visibleTracks,
      virtualHeight: virtual.virtualHeight,
      virtualOffset: virtual.virtualOffset,
      activeTags,
      favoritesOnly,
      tagChips,
      previewTrack
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this._bindContextMenus()
    this._bindPlaylistDragDrop()
    this._bindUploadDropzone()
    this._bindUploadInput()
    this._bindKeyboard()
    this._bindSortSelect()
    this._bindFilterInput()
    this._bindVirtualScroll()
    this._syncScrollerScrollTop()
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
      previewing: previewPath === t.path
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

  async close(options = {}) {
    this._stopPreview({ render: false })
    clearTimeout(this._filterRenderTimer)
    clearTimeout(this._filterPersistTimer)
    if (this._virtualScrollRaf) cancelAnimationFrame(this._virtualScrollRaf)
    this._virtualScrollRaf = null
    this._unbindVirtualScroll()
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

  _bindPlaylistDragDrop() {
    const panel = this.element?.querySelector('.fml-playlist-panel')
    if (!panel || !this.selectedPlaylistId) return

    const list = panel.querySelector('.fml-playlist-tracks')
    if (!list || list.dataset.fmlDndBound) return
    list.dataset.fmlDndBound = '1'

    const app = this
    const playlistId = this.selectedPlaylistId

    const clearDropStyles = () => {
      list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'))
    }

    list.addEventListener('dragstart', (event) => {
      if (!canManageMusicLibrary()) return
      const li = event.target.closest('li[data-path]')
      if (!li) return
      const path = li.dataset.path
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'fml-playlist-track',
        path,
        playlistId
      }))
      li.classList.add('dragging')
    })

    list.addEventListener('dragend', (event) => {
      event.target.closest('li[data-path]')?.classList.remove('dragging')
      clearDropStyles()
    })

    list.addEventListener('dragover', (event) => {
      const li = event.target.closest('li[data-path]')
      if (!li) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      clearDropStyles()
      li.classList.add('drop-target')
    })

    list.addEventListener('dragleave', (event) => {
      const li = event.target.closest('li[data-path]')
      if (li && !li.contains(event.relatedTarget)) li.classList.remove('drop-target')
    })

    list.addEventListener('drop', async (event) => {
      event.preventDefault()
      clearDropStyles()
      if (!canManageMusicLibrary()) return

      let data
      try {
        data = JSON.parse(event.dataTransfer.getData('text/plain'))
      } catch {
        return
      }
      if (data?.type !== 'fml-playlist-track' || data.playlistId !== playlistId) return

      const targetLi = event.target.closest('li[data-path]')
      if (!targetLi) return

      const pl = playlistStore.getPlaylistById(playlistId)
      if (!pl) return

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
      if (!canManageMusicLibrary() || !fileList?.length) return
      const result = await uploadMp3Files(fileList)
      if (result.errors > 0 && result.uploaded === 0) {
        ui.notifications.error(game.i18n.localize('FML.Upload.Failed'))
      } else if (result.uploaded > 0) {
        ui.notifications.info(game.i18n.format('FML.Upload.Complete', result))
      } else if (result.skipped > 0) {
        ui.notifications.warn(game.i18n.format('FML.Upload.Skipped', result))
      }
      await this.render(false)
    }

    const isFileDrag = (event) => {
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

  _restoreFilterFocus(selection) {
    const el = this.element?.querySelector('input[name="filterQuery"]')
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
    this.render(false)
  }

  static onSelectPlaylist(event, target) {
    this.selectedPlaylistId = target.closest('[data-playlist-id]')?.dataset?.playlistId ?? ''
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
