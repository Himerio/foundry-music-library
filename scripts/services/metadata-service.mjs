import { toFoundryMediaPath } from './paths.mjs'

const ID3_HEADER = 10
const ID3_FETCH_BYTES = 262144

function decodeText(bytes, encoding) {
  if (!bytes?.length) return ''
  try {
    if (encoding === 1) return new TextDecoder('utf-16').decode(bytes)
    if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes)
    return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim()
  } catch {
    return ''
  }
}

function parseId3Frames(buffer) {
  const view = new DataView(buffer)
  if (buffer.byteLength < ID3_HEADER) return {}
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2))
  if (sig !== 'ID3') return {}
  const size = (
    (view.getUint8(6) << 21)
    | (view.getUint8(7) << 14)
    | (view.getUint8(8) << 7)
    | view.getUint8(9)
  )
  let offset = ID3_HEADER
  const end = Math.min(ID3_HEADER + size, buffer.byteLength)
  const tags = {}
  while (offset + 10 <= end) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    )
    const frameSize = view.getUint32(offset + 4)
    offset += 10
    if (offset + frameSize > end) break
    const data = new Uint8Array(buffer, offset, frameSize)
    offset += frameSize
    if (frameSize < 1) continue
    const encoding = data[0]
    const text = decodeText(data.subarray(1), encoding)
    if (text) tags[id] = text
  }
  return {
    title: tags.TIT2 || tags.TT2,
    artist: tags.TPE1 || tags.TP1,
    album: tags.TALB || tags.TAL
  }
}

export async function fetchAudioDuration(url) {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    const done = (value) => {
      audio.src = ''
      resolve(value)
    }
    audio.addEventListener('loadedmetadata', () => {
      done(Number.isFinite(audio.duration) ? audio.duration : undefined)
    })
    audio.addEventListener('error', () => done(undefined))
    setTimeout(() => done(undefined), 15000)
    audio.src = url
  })
}

/**
 * @param {string} trackPath
 */
export async function parseTrackMetadata(trackPath) {
  const mediaPath = toFoundryMediaPath(trackPath)
  const url = `${window.location.origin}/${mediaPath}`
  const detected = {}

  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${ID3_FETCH_BYTES - 1}` },
      credentials: 'same-origin'
    })
    if (res.ok) {
      const buf = await res.arrayBuffer()
      Object.assign(detected, parseId3Frames(buf))
    }
  } catch (e) {
    console.error('FML | ID3 parse failed', trackPath, e)
  }

  const duration = await fetchAudioDuration(url)
  if (duration != null) detected.duration = duration

  return detected
}
