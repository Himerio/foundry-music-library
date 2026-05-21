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

### Music Library (v0.2)

- **Upload** toolbar button or drag MP3 files onto the library window (duplicates skipped); the track list panel highlights while dragging
- **Playlist order**: drag tracks in the playlist panel (grip handle); syncs to Foundry
- **Tag chips** in the sidebar filter the track list (tags from metadata editor)
- **Favorites** (per-user): star on tracks; **Favorites** filter in the sidebar
- **Play Preview** from the track context menu (with stop control and row highlight)

### Music Player controls

| Button | What it does |
| --- | --- |
| Playlist dropdown | Choose which module playlist to control (synced Foundry `[Music]` playlist) |
| Previous / Next | Skip backward or forward in the playlist |
| Play / Stop | **Play** starts the playlist (other module playlists stop first). While playing, the same control becomes **Stop** (full stop, not pause) |
| Mode (⇅ / 🔀) | Toggle **Sequential** vs **Shuffle** on the Foundry playlist |
| Volume | Adjusts volume for all tracks in the active playlist (full mode) |
| Compact | Frameless minimal player; position and layout are remembered |
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

## Version

**0.2.0** — playlist DnD reorder, MP3 upload, tag filters, favorites, compact player, preview playback UI.

## Links

- [Repository](https://github.com/Himerio/foundry-music-library)
- [Issues](https://github.com/Himerio/foundry-music-library/issues)
