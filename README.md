# Foundry Music Library

System-agnostic Foundry VTT v13 module: a modern music library and playlist UI on top of native Foundry audio and playlists.

## Requirements

- Foundry VTT **v13**
- MP3 files only, in a **single flat folder** (no subfolders), e.g. `Data/music/*.mp3`

## Installation

### Manifest URL (recommended)

In Foundry: **Settings → Add-on Modules → Install Module**, paste:

```text
https://github.com/Himerio/foundry-music-library/releases/latest/download/module.json
```

Enable the module in your world (no specific game system required).

### Manual

1. Copy this folder to `Data/modules/foundry-music-library`
2. Enable the module in your world
3. Configure **Music Root Folder** in module settings or via **Configure Music Library**

## First use

1. Add MP3 files to your music folder and click **Scan**, or use **Upload** / drag-and-drop MP3s onto the library track list
2. Create playlists and sync to Foundry `[Music]` playlists

## Usage

- **Scene controls** (Token controls): music note icon opens the library (GM / Assistant if allowed)
- **Playlists** in the module sync to Foundry playlists prefixed with `[Music]`
- **Music Player** (GM Player): floating window for session playback — open from the library toolbar or it reopens on load if you left it open

### Music Library

- **Upload** toolbar button or drag MP3 files onto the library window (duplicates skipped); the track list panel highlights while dragging
- **Playlist order**: drag tracks in the playlist panel (grip handle); syncs to Foundry
- **Add to playlist**: drag tracks from **All Tracks** onto a playlist in the sidebar or into the playlist track list
- **Tag chips** and **artist chips** in the sidebar filter the track list (OR within each group)
- **Missing metadata** filter for tracks without title or artist
- **Favorites** (per-user): star on tracks; **Favorites** filter in the sidebar
- **Bulk metadata edit**: select tracks (checkbox or Shift+click range), then **Bulk edit**
- **Play Preview** from the track context menu (with stop control and row highlight)

### Music Player controls (v0.3)

| Button | What it does |
| --- | --- |
| Playlist dropdown | Choose which module playlist to control (synced Foundry `[Music]` playlist) |
| Previous / Next | Skip backward or forward in the playlist |
| Play / Stop | **Play** starts the playlist (other module playlists stop first). While playing, the same control becomes **Stop** (full stop, not pause) |
| Mode (⇅ / 🔀) | Toggle **Sequential** vs **Shuffle** on the Foundry playlist |
| Volume | Adjusts volume for all tracks in the active playlist (full and compact) |
| Progress | Bar and `elapsed / total` timer while a track is playing (full and compact) |
| Compact | Frameless minimal player with progress and volume; position remembered |
| × (Hide) | Close the player; position is remembered |

**Now playing** uses your library metadata (title) when available.

- **Export / Import** JSON for backup and migration (favorites are client-only and not included)

## Development

```bash
npm install
npm run lint
npm run release:zip   # build dist/ for GitHub release
```

Metadata is read from ID3 tags in the browser (no changes to files on disk). Overrides are stored in world settings.

### Theming

UI styles use shared tokens in `styles/fml-tokens.css` (spacing, borders, surfaces) mapped to Foundry v13 CSS variables (`--color-bg-*`, `--color-text-*`, `--font-size-*`) for consistent light/dark appearance.

## Version

**0.4.1** — sidebar artist/tag filter scroll (~200px); bulk add selected tracks to current playlist.

**0.4.0** — upload progress overlay (blocking UI), playlist search, playlist track count in panel header.

**0.3.1** — unified design tokens and CSS consistency pass.

**0.3.0** — library→playlist drag, bulk metadata, artist/missing filters, GM player progress bar (full + compact).

**0.2.x** — playlist DnD reorder, MP3 upload, tag filters, favorites, compact player, preview playback UI.

## Links

- [Repository](https://github.com/Himerio/foundry-music-library)
- [Issues](https://github.com/Himerio/foundry-music-library/issues)
