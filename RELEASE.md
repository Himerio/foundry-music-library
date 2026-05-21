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
