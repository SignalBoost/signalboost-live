import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
export const videoStorageDir = join(root, 'public', 'video-storage')
export const videoRenderDir = join(root, 'public', 'video-renders')

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120)
}

export async function persistVideoUpload(file: File) {
  await mkdir(videoStorageDir, { recursive: true })
  const safeName = `${Date.now()}-${safeFileName(file.name || 'video.mp4')}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const absolutePath = join(videoStorageDir, safeName)
  await writeFile(absolutePath, buffer)
  return {
    filename: safeName,
    absolutePath,
    publicUrl: `/video-storage/${safeName}`,
    sizeMb: Math.ceil(buffer.byteLength / 1024 / 1024),
  }
}
