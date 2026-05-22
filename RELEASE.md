# Publishing a release

## One-time: Foundry install URL

Users install via **Add-on Modules → Install Module** with this manifest URL:

```text
https://github.com/Himerio/foundry-music-library/releases/latest/download/module.json
```

## Build release assets

From the module root:

```bash
npm run release:zip
```

Uses PowerShell `Compress-Archive` on Windows, or `zip` on Linux/macOS.

This creates:

- `dist/module.json` — upload to the GitHub release
- `dist/foundry-music-library.zip` — upload to the same release

The zip contains a top-level `foundry-music-library/` folder (required by Foundry).

## Create a GitHub Release

1. Bump `"version"` in `module.json` and commit.
2. Run `npm run release:zip`.
3. On GitHub: **Releases → Draft a new release**
4. Tag: `v0.2.0` (must match `module.json` version, with `v` prefix).
5. Attach **both** files from `dist/`.
6. Publish the release.

Foundry uses `releases/latest/download/…` so the newest release becomes the default install target.

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
