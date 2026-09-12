import type { PortableA2AHost } from './portable-a2a-host.ts'
import type { SpecialistQualificationAssessmentPort } from './specialist-qualification-assessment.ts'

export const COS_A2A_RUNTIME_HOST_VERSION = 'signalboost-cos-a2a-runtime-host-v2' as const

const HOST_KEY = Symbol.for('signalboost.cos.a2a.runtime.host')
const QUALIFICATION_KEY = Symbol.for('signalboost.cos.a2a.qualification.assessment')
type GlobalWithHost = typeof globalThis & {
  [HOST_KEY]?: PortableA2AHost
  [QUALIFICATION_KEY]?: SpecialistQualificationAssessmentPort
}

/** Deployment/portable host installation seam. Never stores credentials itself. */
export function installCOSA2ARuntimeHost(host: PortableA2AHost): () => void {
  const target = globalThis as GlobalWithHost
  const previous = target[HOST_KEY]
  target[HOST_KEY] = host
  return () => {
    if (target[HOST_KEY] === host) {
      if (previous) target[HOST_KEY] = previous
      else delete target[HOST_KEY]
    }
  }
}

export function getCOSA2ARuntimeHost(): PortableA2AHost | null {
  return (globalThis as GlobalWithHost)[HOST_KEY] ?? null
}

/** Host-owned qualification assessment seam. The installed port owns hidden probes and independent verification. */
export function installCOSA2AQualificationAssessmentPort(port: SpecialistQualificationAssessmentPort): () => void {
  const target = globalThis as GlobalWithHost
  const previous = target[QUALIFICATION_KEY]
  target[QUALIFICATION_KEY] = port
  return () => {
    if (target[QUALIFICATION_KEY] === port) {
      if (previous) target[QUALIFICATION_KEY] = previous
      else delete target[QUALIFICATION_KEY]
    }
  }
}

export function getCOSA2AQualificationAssessmentPort(): SpecialistQualificationAssessmentPort | null {
  return (globalThis as GlobalWithHost)[QUALIFICATION_KEY] ?? null
}
