# Foundry Music Library

System-agnostic Foundry VTT v13 module: a modern music library and playlist UI on top of native Foundry audio and playlists.

## Requirements

- Foundry VTT **v13**
- MP3 files only, in a **single flat folder** (no subfolders), e.g. `Data/music/*.mp3`

## Installation

1. Copy this folder to `Data/modules/foundry-music-library`
2. Enable the module in your world (no specific game system required)
3. Configure **Music Root Folder** in module settings or via **Configure Music Library**
4. Add MP3 files to that folder and click **Scan**, or use **Upload** / drag-and-drop MP3s into the library window

## Usage

- **Scene controls** (Token controls): music note icon opens the library (GM / Assistant if allowed)
- **Playlists** in the module sync to Foundry playlists prefixed with `[Music]`
- **Music Player** (GM Player): floating window for session playback — open from the library toolbar or it reopens on load if you left it open

### Music Library (v0.2)

- **Upload** toolbar button or drag MP3 files onto the library window (duplicates skipped)
- **Playlist order**: drag tracks in the playlist panel (grip handle); syncs to Foundry
- **Tag chips** in the sidebar filter the track list (tags from metadata editor)
- **Favorites** (per-user): star on tracks; **Favorites** filter in the sidebar

### Music Player controls

| Button | What it does |
| --- | --- |
| Playlist dropdown | Choose which module playlist to control (synced Foundry `[Music]` playlist) |
| Previous / Next | Skip backward or forward in the playlist |
| Play / Stop | **Play** starts the playlist (other module playlists stop first). While playing, the same control becomes **Stop** (full stop, not pause) |
| Mode (⇅ / 🔀) | Toggle **Sequential** vs **Shuffle** on the Foundry playlist |
| Volume | Adjusts volume for all tracks in the active playlist |
| Compact | Toggle minimal player layout (client setting) |
| × (Hide) | Close the player; position is remembered |

**Now playing** uses your library metadata (title) when available. See `spec.md` §7 for full behavior.

- **Export / Import** JSON for backup and migration (favorites are client-only and not included)

## Development

```bash
npm install
npm run lint
```

Metadata is read from ID3 tags in the browser (no changes to files on disk). Overrides are stored in world settings.

## Version

**0.2.0** — playlist DnD reorder, MP3 upload, tag filters, favorites, compact player. See `spec.md` for roadmap.
