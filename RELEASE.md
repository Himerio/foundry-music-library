# Publishing a release

## One-time: Foundry install URL

Users install via **Add-on Modules → Install Module** with this manifest URL:

```text
https://github.com/Himerio/foundry-music-library/releases/latest/download/module.json
```

## Release with one command (recommended)

Prerequisites (once): `git`, `node`, `zip`, GitHub CLI logged in (`gh auth login`).

1. Bump `"version"` in **both** `module.json` and `package.json`.
2. Add a `## vX.Y.Z release notes` section to this file (it becomes the GitHub release description).
3. Commit everything on `main`.
4. Run:

```bash
npm run release -- --dry-run   # optional: checks + build only, publishes nothing
npm run release
```

The script checks versions, branch (`main`), clean working tree and that the release does not exist yet,
builds `dist/`, pushes `main` (over HTTPS with the `gh` token, so a passphrase-protected SSH key is fine),
and creates the GitHub release `vX.Y.Z` with both assets attached.

## Build release assets manually

From the module root:

```bash
npm run release:zip
```

Uses PowerShell `Compress-Archive` on Windows, or `zip` on Linux/macOS.

This creates:

- `dist/module.json` — upload to the GitHub release
- `dist/foundry-music-library.zip` — upload to the same release

The zip contains a top-level `foundry-music-library/` folder (required by Foundry).

## Create a GitHub Release manually

1. Bump `"version"` in `module.json` and commit.
2. Run `npm run release:zip`.
3. On GitHub: **Releases → Draft a new release**
4. Tag: `v0.2.0` (must match `module.json` version, with `v` prefix).
5. Attach **both** files from `dist/`.
6. Publish the release.

Foundry uses `releases/latest/download/…` so the newest release becomes the default install target.

## v0.4.1 release notes

- **Sidebar:** artist/tag filter chips capped at ~200px with vertical scroll (header stays visible)
- **Bulk toolbar:** add all selected tracks to the current playlist (library sort order; skips duplicates)

## v0.5.0 release notes

**Requires Foundry VTT v14 (verified on 14.370). v13 is no longer supported — v13 worlds should stay on 0.4.1.**

- **v14 migration:** context menu entries use the v14 `label` / `onClick` / icon-class format (no deprecation warnings)
- **Track context menu:** "Add to playlist" now lists each playlist directly ("Add to: …"); the old nested submenu was never rendered by Foundry
- **Detached windows:** the library and player work when popped out with v14's *Detach* button; metadata, bulk-edit, playlist-name, import and delete dialogs open in the same window
- **GM Player:** buttons use ApplicationV2 actions; compact idle fade now follows the core *UI fade* settings (previously always 50% / 500 ms)
- **Import:** mode is read from the dialog form itself (no global DOM lookup)
- Uses `FilePicker.implementation` (respects storage modules that replace the file picker), `game.clipboard`, `foundry.utils.saveDataToFile`
- Removed v1 `Dialog` fallbacks and other pre-v13 compatibility branches
- API is also exposed as `game.modules.get('foundry-music-library').api` (`game.musicLibrary` still works)

## v0.4.0 release notes

- **Upload:** blocking overlay with progress bar while MP3 files upload and library rescans; prevents duplicate uploads mid-batch
- **Playlist panel:** search field (same text matching as All Tracks), track count badge in header (`N` or `filtered / total`)
- Reorder drag disabled while playlist search filter is active (library→playlist drop still works)

## v0.3.1 release notes

- Shared design tokens (`fml-tokens.css`): spacing scale, borders, semantic surfaces
- Library and GM Player CSS aligned to Foundry theme variables; fewer duplicate light-theme overrides
- Metadata/Bulk dialogs: `form-group` layout; metadata editor uses `div` wrapper for DialogV2 compatibility
- Style fix: tag/artist chips, row hovers, active playlist, preview highlight, panel dividers, GM track list

## v0.3.0 release notes

- **GM Music Player:** playback progress bar and `elapsed / total` timer in full and compact modes (display only; seek in v0.4)
- **Compact player:** volume slider restored per spec
- **Music Library:** drag tracks from All Tracks onto playlists (sidebar or playlist list)
- **Filters:** artist chips (OR) and missing-metadata filter
- **Bulk metadata:** multi-select tracks and apply title/artist/album/tags (replace, merge, or clear tags)
- **UX:** empty playlist drag hint; bulk selection toolbar
