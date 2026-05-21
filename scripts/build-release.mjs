import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODULE_NAME = basename(ROOT)
const DIST = join(ROOT, 'dist')
const EXCLUDE_TOP = new Set(['node_modules', '.git', 'dist', 'spec.md', 'package-lock.json'])

function shouldCopy(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/')
  if (!rel) return true
  const top = rel.split('/')[0]
  if (EXCLUDE_TOP.has(top)) return false
  return true
}

function copyModuleToStaging(stagingDir) {
  cpSync(ROOT, stagingDir, {
    recursive: true,
    filter: (src) => shouldCopy(src)
  })
}

function createZip(stagingParent, zipPath) {
  const folderPath = join(stagingParent, MODULE_NAME)
  if (process.platform === 'win32') {
    const ps = `Compress-Archive -LiteralPath '${folderPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' })
    return
  }
  execSync(`cd "${stagingParent}" && zip -qr "${zipPath}" "${MODULE_NAME}"`, { stdio: 'inherit' })
}

mkdirSync(DIST, { recursive: true })
writeFileSync(join(DIST, 'module.json'), readFileSync(join(ROOT, 'module.json'), 'utf8'))

const zipOut = join(DIST, `${MODULE_NAME}.zip`)
if (existsSync(zipOut)) rmSync(zipOut)

const stagingRoot = join(tmpdir(), `fml-release-${Date.now()}`)
const stagingModule = join(stagingRoot, MODULE_NAME)
mkdirSync(stagingModule, { recursive: true })

try {
  copyModuleToStaging(stagingModule)
  createZip(stagingRoot, zipOut)
} finally {
  rmSync(stagingRoot, { recursive: true, force: true })
}

const version = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')).version
console.log('Release assets:')
console.log(`  ${join(DIST, 'module.json')}`)
console.log(`  ${zipOut}`)
console.log(`\nUpload both to GitHub Release tag v${version}`)
