export type PortableBrowserActivityEventType =
  | 'runtime_created'
  | 'session_started'
  | 'session_completed'
  | 'session_failed'

export interface PortableBrowserActivityEvent {
  readonly runtimeId: string
  readonly eventType: PortableBrowserActivityEventType
  readonly providerId?: string
  readonly adapterId?: string
  readonly outcome?: string
}

/**
 * Durable, redacted activity boundary for an adopting browser-runtime host.
 * Implementations must never persist credentials, URLs, page content, screenshots,
 * prompts, or browser evidence.
 */
export interface PortableBrowserActivityPort {
  record(event: PortableBrowserActivityEvent): Promise<void>
}
