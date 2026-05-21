# Foundry VTT Music Library Module — Technical Specification

## Overview

A Foundry VTT module that provides a modern, convenient music library and playlist management experience on top of Foundry’s native audio system.

The module enhances music workflow for GMs by providing:

- Music library indexing
- Metadata management
- Search and filtering
- Convenient playlist management
- Drag & Drop workflows
- Fast playback controls during sessions
- Import/export for backup and migration

The module uses Foundry's native audio engine and playlist playback system for synchronization and streaming to players.

---

# Core Philosophy

The module acts as an enhanced UI/UX layer over Foundry's native playlist system.

Foundry remains responsible for:

- Audio playback
- Audio synchronization between players
- Streaming audio to connected clients
- Permissions and ownership
- Volume routing

The module is responsible for:

- Music file indexing
- Metadata extraction and editing
- Music library browsing
- Search and filtering
- Playlist creation and editing
- Fast GM playback controls
- Convenient upload workflows

---

# Supported Audio Format

## Supported formats

### Required

- MP3

### Design decision

Only MP3 files are supported to simplify metadata extraction, indexing, and browser compatibility.

If users have other formats, they should convert them externally.

---

# Music Library Structure

## Music Root Folder

GM can select a root folder for music files.

Example:

```txt
Data/music/
```

### Important constraint

The selected folder contains only files.

No nested folder support.

Example:

```txt
music/
├─ battle_theme.mp3
├─ tavern_loop.mp3
├─ horror_ambience.mp3
└─ boss_theme.mp3
```

Sorting and organization happen entirely through playlists and metadata.

---

# Main Features

## 1. Music Library Indexing

### Goal

Scan selected folder and build a searchable music library.

### Scan behavior

- Manual scan button
- Optional rescan button
- Scan only selected folder
- No recursive indexing

### Indexed information

Each track should contain:

```ts
interface MusicTrack {
  path: string
  filename: string
  format: 'mp3'

  detected: {
    title?: string
    artist?: string
    album?: string
    duration?: number
  }

  override: {
    title?: string
    artist?: string
    album?: string
    tags?: string[]
  }

  createdAt: string
  updatedAt: string
}
```

### Metadata fallback order

Display name priority:

1. Override metadata
2. Detected MP3 metadata
3. Filename

Example:

```txt
override.title
→ detected.title
→ battle_theme_01.mp3
```

---

## 2. Metadata Extraction

### Goal

Automatically extract metadata from MP3 files.

Suggested libraries (not hard requirements):

### Option 1 (preferred)

`music-metadata-browser`

Pros:

- Actively maintained
- Popular
- Strong metadata support
- Works in browser context

Supports:

- Title
- Artist
- Album
- Duration
- Embedded metadata

### Alternative

`jsmediatags`

Good lightweight alternative for ID3 tags.

---

## 3. Manual Metadata Editing

### Goal

Allow manual correction of metadata.

Common use cases:

- Missing artist
- Missing title
- Incorrect metadata
- Custom categorization

### Editable fields

```ts
override: {
  title?: string
  artist?: string
  album?: string
  tags?: string[]
}
```

### Important behavior

The module does NOT modify MP3 files.

Metadata edits are stored internally in module data.

Original files remain untouched.

### UX

Inline edit or modal editor.

Example:

```txt
Title: The Last Stand
Artist: Audiomachine
Album:
Tags: battle, boss, epic
```

---

## 4. Search and Filtering

### Goal

Fast music discovery.

### Searchable fields

- Title
- Artist
- Album
- Filename
- Tags

### Search behavior

Real-time filtering.

### Suggested filters

Quick filter chips:

```txt
[battle]
[tavern]
[horror]
[boss]
[ambient]
```

### Sorting

Supported sorting:

- Title
- Artist
- Duration
- Recently added
- Recently updated

---

## 5. Playlist Management

### Goal

Provide significantly improved playlist UX.

### Playlist capabilities

- Create playlist
- Rename playlist
- Delete playlist
- Add tracks
- Remove tracks
- Reorder tracks
- Duplicate playlist

### Adding tracks

Supported methods:

#### Drag & Drop

Track → Playlist

#### Context menu

```txt
Right click
→ Add to Playlist
```

#### Button

```txt
+ Add
```

### Playlist UI

Modern two-column layout:

```txt
┌────────────────────────────────────┐
│ Playlists          │ Tracks        │
├────────────────────────────────────┤
│ Combat              │ Dragon Fight │
│ Tavern              │ Escape Theme │
│ Horror              │ Final Duel   │
└────────────────────────────────────┘
```

### Reordering

Drag & drop reorder inside the playlist track list (`.fml-playlist-tracks`). Grip handle on each row; order persists to `trackPaths` and Foundry sync.

---

## 6. Foundry Playlist Synchronization

### Goal

Sync module playlists into Foundry native playlists.

Module playlists are the source of truth.

Foundry playlists are generated/synchronized representations.

### Sync behavior

When playlist changes:

- Create native Foundry playlist if missing
- Update tracks
- Update names
- Preserve order

Suggested playlist naming convention:

```txt
[Music] Boss Themes
```

### Playlist sound names (order preservation)

Foundry sorts `PlaylistSound` documents alphabetically by `name`, ignoring `sort` in the sidebar. On sync, each sound name is prefixed with a zero-padded index so alphabetical order matches the module playlist:

```txt
001 - The Last Stand
002 - Victory Theme
010 - Ambient Loop
```

Pad width is `max(3, digits in track count)` so lists sort correctly (avoid `1`, `10`, `2`). The Music Library UI and metadata still use the unprefixed title; the prefix is stripped when shown in the GM player fallback label.

### Benefits

- Native playback
- Native synchronization
- Compatible with existing Foundry systems

---

## 7. GM Playback Widget (Music Player)

### Goal

Fast music control during live sessions.

GM-only floating window (`GmPlaybackWidget`), opened from **GM Player** in the Music Library or restored when the world loads if it was left open.

### Controls (v0.1)

| Control | Action |
| --- | --- |
| **Playlist** (header dropdown) | Select active module playlist; syncs to the matching Foundry `[Music]` playlist. Stops playback on other module playlists when changed. |
| **Hide** (×) | Close widget; saves window position (client setting). |
| **Previous** (⏮) | `playNext` backward on the active Foundry playlist. |
| **Play / Stop** (▶ / ■) | When idle: **Play** — stops other module playlists, then starts this playlist (first track / native play). When playing: **Stop** — `stopAll()` on the active playlist (no separate pause). |
| **Next** (⏭) | `playNext` forward on the active Foundry playlist. |
| **Mode** (⇅ / 🔀) | Toggles Foundry playlist mode **Sequential** ↔ **Shuffle** (icon and tooltip reflect current mode). |
| **Volume** (slider) | Sets volume (0–1) on all `PlaylistSound` documents in the active playlist; live update on the currently playing sound. |

**Now playing** shows the track title from module metadata when available, otherwise the Foundry sound name.

### Layout (v0.1)

```txt
┌─────────────────────────────────────┐
│ 🎵 [ Boss Themes        ▼]      [×]  │
├─────────────────────────────────────┤
│ Now Playing:                        │
│ The Last Stand                      │
│                                     │
│  [⏮]  [▶]  [⏭]  [⇅]                │
│  Vol  ───────●────                  │
└─────────────────────────────────────┘
```

While audio is playing, the center transport button shows **Stop** (■) instead of **Play** (▶). The mode button shows shuffle or sequential icon according to the synced Foundry playlist.

### Widget behavior

- Draggable window; position persisted per user (`widgetUi`, client scope)
- Visibility flag (`widgetVisible`) restores the player on world load when enabled
- GM only (not Assistant)
- Playback uses Foundry native `Playlist` / `PlaylistSound` API (`playSound`, `playNext`, `stopAll`)
- Only one module playlist should play at a time; starting play or switching playlist stops others prefixed with `[Music]`

### Compact mode (v0.2)

Toggle in widget header. Hides the “Now playing” block and volume label; narrower default width. Persisted in client `widgetUi.compact`.

### Deferred (v0.3+)

- Collapsible chrome

---

## 8. Drag & Drop Upload

### Goal

Fast import of music files.

### Supported behavior

Drag MP3 files into module window.

Flow:

```txt
Drop files
→ Upload to selected music folder
→ Refresh library
→ Parse metadata
→ Add to index
```

### Alternative upload

Upload button.

Example:

```txt
[Upload MP3 Files]
```

---

## 9. Import / Export

### Goal

Backup, migration, portability.

### Export format

JSON

Example:

```ts
{
  schemaVersion: 1,
  moduleVersion: "0.1.0",

  settings: {
    musicRoot: "music"
  },

  tracks: {},

  playlists: []
}
```

### Export contents

Include:

- Track metadata
- Metadata overrides
- Tags
- Playlist definitions
- Module settings

### Import modes

#### Merge

Merge imported data.

#### Replace

Replace existing library.

#### Metadata only

Import metadata without playlists.

#### Playlists only

Import playlist definitions.

### Validation

On import:

- Check missing files
- Report invalid paths
- Show warnings

---

# Data Storage

## World settings

Store:

- Indexed library
- Metadata overrides
- Playlist definitions
- Module settings

Recommended approach:

```ts
game.settings.register(...)
```

### Scope

```txt
scope: world
```

### Reason

Music library belongs to the world/session.

---

## Client settings

Store per-user UI preferences:

Examples:

- Window size
- Widget position
- Compact mode
- Sort preference
- View preference

Scope:

```txt
scope: client
```

---

# UI / UX Guidelines

## General design goals

Modern, minimal, fast.

Inspired by:

- Spotify
- Steam Library
- Modern file managers

Avoid:

- Dense tables
- Nested modal hell
- Tiny click targets

---

## Layout Principles

### Main library window

Three-panel layout preferred.

```txt
Sidebar
→ playlists / filters

Center
→ track table

Top
→ search + actions
```

Example:

```txt
┌──────────────────────────────────────────────┐
│ Search...              [Scan] [Upload]       │
├────────────┬─────────────────────────────────┤
│ Playlists  │ Track Library                   │
│ Filters    │                                 │
│ Tags       │ Title | Artist | Duration       │
│            │                                 │
└────────────┴─────────────────────────────────┘
```

### Track library columns (`fml-track-panel`)

Column order (left to right):

1. **Title** — primary column, slightly wider (`1.2fr`) for quick scanning
2. **Artist**
3. **Duration**
4. **Actions** — add to playlist, edit metadata

Title before artist matches common music-library UX (song name is the main identifier).

---

## Interaction standards

### Context menus

Right click should expose actions.

Example:

```txt
Play Preview
Add to Playlist
Edit Metadata
Copy Filename
Reveal File
```

### Keyboard UX

Recommended:

```txt
Ctrl+F → Search
Delete → Remove from playlist
Space → Play / Pause
Enter → Add to playlist
```

---

## Empty states

Provide helpful onboarding.

Example:

```txt
No tracks indexed.

Select a music folder and run a scan.
```

---

# Performance Considerations

### Large libraries

Target:

1000+ tracks.

Requirements:

- Cached index
- No automatic rescan on startup
- Virtualized list if needed

### Metadata parsing

Only parse changed/new files during rescan.

Avoid reparsing everything.

---

# Permissions

### GM

Full access.

### Assistant GM

Optional access.

### Players

No library management access.

Playback occurs through Foundry native playlists.

---

# Suggested Tech Stack

## Metadata parsing

Preferred:

- music-metadata-browser

Alternative:

- jsmediatags

## Drag & Drop

Native browser drag/drop APIs.

## State management

Simple reactive state preferred.

Avoid unnecessary complexity.

## UI

Use Foundry native application system.

Prefer modern CSS layout:

- CSS Grid
- Flexbox

Avoid legacy table-heavy layouts.

---

# Development Priorities

## MVP (v0.1)

- Folder selection
- MP3 indexing
- Metadata parsing
- Manual metadata editing
- Search
- Playlist management
- Foundry playlist sync
- Floating GM widget
- JSON import/export

## v0.2 (shipped)

- Drag & drop MP3 upload into Music Library (flat music folder; skip duplicates)
- Playlist reorder via drag & drop in `.fml-playlist-tracks` (replaces up/down buttons)
- Tag filter chips in sidebar (OR filter; tags from metadata overrides)
- Favorites: star on tracks, client-scoped paths, “Favorites” filter (not exported in JSON)
- Compact Music Player mode

## v0.3 (planned)

- Drag library track → playlist (add via DnD)
- Bulk metadata edit
- Smart playlists
- Advanced filtering
- Improved UX polish