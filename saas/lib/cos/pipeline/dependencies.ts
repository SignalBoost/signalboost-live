export async function runFFmpegRender(_assets: unknown): Promise<unknown> {
  throw new Error('runFFmpegRender helper is not wired into the COSA video worker runtime.')
}

export async function dispatchToCloudRenderer(_payload: unknown): Promise<unknown> {
  throw new Error('dispatchToCloudRenderer helper is not wired into the COSA routing runtime.')
}

export async function getSystemCpuLoad(): Promise<number> {
  const { loadavg, cpus } = await import('node:os')
  const cores = Math.max(cpus().length, 1)
  return Math.min(loadavg()[0] / cores, 1)
}
