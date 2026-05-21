import { scanMusicLibrary, browseMusicFiles, getTrackIndex } from './index-service.mjs'
import { getMusicRoot, isMp3Filename, normalizeTrackPath } from './paths.mjs'

/**
 * @param {File} file
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateUploadFile(file) {
  if (!file?.name || !isMp3Filename(file.name)) {
    return { ok: false, reason: 'notMp3' }
  }
  if (/[/\\]/.test(file.name)) {
    return { ok: false, reason: 'nested' }
  }
  return { ok: true }
}

/**
 * Directory path relative to Foundry "data" source (trailing slash).
 */
export function getUploadDirectory() {
  const root = getMusicRoot().replace(/^\/+/, '').replace(/\\/g, '/')
  return root.endsWith('/') ? root : `${root}/`
}

/**
 * @param {string} targetDir
 */
async function ensureUploadDirectory(targetDir) {
  const FilePicker = foundry.applications.apps.FilePicker
  if (!FilePicker?.browse) return

  try {
    await FilePicker.browse('data', targetDir, { wildcard: false })
    return
  } catch {
    /* directory may not exist yet */
  }

  const dirPath = targetDir.replace(/\/$/, '')
  if (!dirPath || !FilePicker.createDirectory) return

  const parts = dirPath.split('/').filter(Boolean)
  let built = ''
  for (const part of parts) {
    built = built ? `${built}/${part}` : part
    try {
      await FilePicker.createDirectory('data', built)
    } catch {
      /* segment may already exist */
    }
  }
}

/**
 * @param {object} response
 */
function isUploadResponseOk(response) {
  if (!response || typeof response !== 'object') return false
  if (response.error) return false
  return Boolean(response.path || response.target)
}

/**
 * @param {string} targetDir
 * @param {File} file
 */
async function postUploadFile(targetDir, file) {
  const FilePicker = foundry.applications.apps.FilePicker

  if (FilePicker?.upload) {
    const response = await FilePicker.upload('data', targetDir, file, {}, { notify: false })
    if (!isUploadResponseOk(response)) {
      throw new Error('FilePicker.upload returned no target path')
    }
    return response
  }

  const formData = new FormData()
  formData.append('source', 'data')
  formData.append('path', targetDir)
  formData.append('file', file, file.name)
  const response = await fetch(FilePicker?.uploadURL ?? '/upload', {
    method: 'POST',
    body: formData
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }
  const json = await response.json().catch(() => ({}))
  if (!isUploadResponseOk(json)) {
    throw new Error('Upload endpoint returned no target path')
  }
  return json
}

/**
 * @param {FileList | File[]} fileList
 * @returns {Promise<{ uploaded: number, skipped: number, errors: number }>}
 */
export async function uploadMp3Files(fileList) {
  const files = [...fileList]
  const targetDir = getUploadDirectory()
  await ensureUploadDirectory(targetDir)

  const index = getTrackIndex()
  const { files: onDisk } = await browseMusicFiles()
  const onDiskNames = new Set(
    onDisk.map((f) => f.split('/').pop()?.toLowerCase()).filter(Boolean)
  )

  let uploaded = 0
  let skipped = 0
  let errors = 0

  for (const file of files) {
    const validation = validateUploadFile(file)
    if (!validation.ok) {
      skipped += 1
      continue
    }

    const normalized = normalizeTrackPath(file.name)
    const nameLower = file.name.toLowerCase()
    if (index[normalized] || onDiskNames.has(nameLower)) {
      skipped += 1
      continue
    }

    try {
      await postUploadFile(targetDir, file)
      uploaded += 1
      onDiskNames.add(nameLower)
    } catch (e) {
      console.error('FML | Upload failed', file.name, e)
      errors += 1
    }
  }

  if (uploaded > 0) {
    await scanMusicLibrary({ forceMetadata: false })
  }

  return { uploaded, skipped, errors }
}
