/* eslint-disable no-console */
// Publish a GitHub release for the version in module.json.
//
//   npm run release              check, push main, build dist/, create GitHub release vX.Y.Z
//   npm run release -- --dry-run check and build only, nothing is pushed or published
//
// Requires: git, node, zip, and the GitHub CLI (`gh auth login`). Pushing goes over HTTPS
// with the gh token, so a passphrase-protected SSH key does not block it.
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry-run')
const RELEASE_BRANCH = 'main'

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...options })?.toString().trim() ?? ''
}

function succeeds(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

const readJson = (file) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
const manifest = readJson('module.json')
const pkg = readJson('package.json')
const { version } = manifest
const tag = `v${version}`

const repoMatch = /github\.com\/([^/]+\/[^/#?]+)/.exec(manifest.url ?? '')
if (!repoMatch) fail('module.json "url" must point to the GitHub repository.')
const repo = repoMatch[1].replace(/\.git$/, '')
const pushUrl = `https://github.com/${repo}.git`
// Use only the gh credential helper for this push, ignoring any configured helpers.
const ghGit = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']

console.log(`Releasing ${manifest.id} ${tag} → ${repo}${DRY_RUN ? ' (dry run)' : ''}`)

// --- Checks -----------------------------------------------------------------
if (pkg.version !== version) {
  fail(`Version mismatch: module.json is ${version}, package.json is ${pkg.version}.`)
}
for (const tool of [['zip', ['-v']], ['gh', ['--version']]]) {
  if (!succeeds(...tool)) fail(`"${tool[0]}" is not installed.`)
}
if (!succeeds('gh', ['auth', 'status'])) fail('GitHub CLI is not logged in. Run: gh auth login')

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== RELEASE_BRANCH) fail(`Releases are made from "${RELEASE_BRANCH}", current branch is "${branch}".`)
if (run('git', ['status', '--porcelain'])) fail('Working tree has uncommitted changes. Commit them first.')
if (succeeds('gh', ['release', 'view', tag, '--repo', repo])) fail(`Release ${tag} already exists on GitHub.`)

const releaseDoc = readFileSync(join(ROOT, 'RELEASE.md'), 'utf8')
const section = new RegExp(`^## ${tag.replace(/\./g, '\\.')} release notes\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')
const notes = section.exec(releaseDoc)?.[1]?.trim()
if (!notes) fail(`RELEASE.md has no "## ${tag} release notes" section.`)

// --- Build ------------------------------------------------------------------
console.log('\nBuilding release assets…')
run('node', [join('scripts', 'build-release.mjs')], { stdio: 'inherit' })
const assets = [join(ROOT, 'dist', 'module.json'), join(ROOT, 'dist', `${manifest.id}.zip`)]

if (DRY_RUN) {
  console.log(`\nDry run OK. Notes for ${tag}:\n\n${notes}\n`)
  process.exit(0)
}

// --- Publish ----------------------------------------------------------------
console.log(`\nPushing ${RELEASE_BRANCH}…`)
run('git', [...ghGit, 'push', pushUrl, `HEAD:refs/heads/${RELEASE_BRANCH}`], { stdio: 'inherit' })
const commit = run('git', ['rev-parse', 'HEAD'])

const tmp = mkdtempSync(join(tmpdir(), 'fml-notes-'))
try {
  const notesFile = join(tmp, 'notes.md')
  writeFileSync(notesFile, `${notes}\n`)
  console.log(`\nCreating GitHub release ${tag}…`)
  run('gh', [
    'release', 'create', tag, ...assets,
    '--repo', repo,
    '--target', commit,
    '--title', tag,
    '--notes-file', notesFile
  ], { stdio: 'inherit' })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

run('git', [...ghGit, 'fetch', pushUrl, `refs/tags/${tag}:refs/tags/${tag}`])
console.log(`\n✔ Released ${tag}: https://github.com/${repo}/releases/tag/${tag}`)
