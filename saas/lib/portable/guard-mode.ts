// saas/lib/portable/guard-mode.ts
//
// Guard-mode resolution for bulk execution paths.
//
// PORTABLE KERNEL. No host imports, no platform env vars, no singletons. Everything
// the buyer's stack supplies arrives as an injected reader. This module decides ONE
// thing: for this bulk run, do we execute in 'standard' mode or 'guarded' mode — and
// it always says why, because a refusal without a cause is a guessing game for the
// operator who has to act on it.
//
// Precedence, highest first:
//   1. An explicit per-run override (an operator choosing speed for a low-stakes batch)
//   2. The buyer's saved setting (the cockpit toggle)
//   3. GUARD_MODE_DEFAULT
//
// Guarded mode WITHOUT a checkpoint store is REFUSED, never silently downgraded to
// standard. A caller asking for guarded mode is making a promise to someone; running
// without checkpoints keeps the promise's wording and drops its meaning.

export type GuardMode = 'standard' | 'guarded';

/**
 * Off for everyone unless the buyer turns it on. Guarded mode trades throughput for a
 * bounded blast radius; that trade belongs to the buyer's security team, not to us.
 */
export const GUARD_MODE_DEFAULT: GuardMode = 'standard';

export type GuardModeSource =
  | 'run-override'
  | 'buyer-setting'
  | 'default';

/** Scope a setting lookup. All fields optional so single-tenant buyers can ignore them. */
export interface GuardModeScope {
  readonly tenantId?: string;
  readonly workspaceId?: string;
  /** e.g. 'lead-update' | 'budget-change' | 'sequence-rewrite' — allows per-path settings. */
  readonly operation?: string;
}

/**
 * Injected port. The buyer's stack answers from wherever it keeps tenant settings.
 * Return null/undefined for "not configured" so we can fall through to the default
 * instead of treating an absent setting as an explicit 'off'.
 */
export interface GuardModeSettingReader {
  readGuardModeEnabled(scope: GuardModeScope): Promise<boolean | null | undefined>;
}

export interface GuardModeResolutionInput {
  /** True when a checkpoint store is available to executeGuardedBulk for this run. */
  readonly hasCheckpointStore: boolean;
  readonly scope?: GuardModeScope;
  readonly settingReader?: GuardModeSettingReader;
  /** Per-run override from the cockpit or an API caller. */
  readonly runOverride?: GuardMode | null;
}

export interface GuardModeResolution {
  /** The mode to pass to executeGuardedBulk. Only meaningful when refused === false. */
  readonly mode: GuardMode;
  readonly source: GuardModeSource;
  /**
   * True when guarded mode was asked for and cannot be honoured. The caller MUST NOT
   * run the batch: refusing before the first record changes is the whole point.
   */
  readonly refused: boolean;
  /** Stable machine code for logs, SIEM ingestion and support triage. */
  readonly code:
    | 'GUARD_MODE_RESOLVED'
    | 'GUARD_MODE_NO_CHECKPOINT_STORE'
    | 'GUARD_MODE_SETTING_UNAVAILABLE';
  /** Operator-facing sentence. Always populated, including on the happy path. */
  readonly reason: string;
}

/**
 * Copy for the cockpit toggle and any surface that explains the mode.
 *
 * Deliberately worded as BLAST RADIUS, never as reversibility. Batching does not turn a
 * compensating write-back into a restore: if a person edits a record between capture and
 * write-back, restoring the old value overwrites their newer one, and we cannot see edits
 * we did not make. Do not let any downstream surface upgrade this into "fully reversible".
 */
export const GUARD_MODE_COPY = {
  label: 'Guarded bulk execution',
  standardSummary:
    'Bulk changes run at full speed. No checkpoint is taken, so changes that succeed cannot be undone by this system.',
  guardedSummary:
    'Bulk changes run in checkpointed chunks. If something goes wrong, at most one chunk of records is affected and you get their ids.',
  refusedNoCheckpointStore:
    'Guarded execution was requested but no checkpoint store is configured, so no batch was started and nothing was changed.',
} as const;

function normaliseSetting(value: boolean | null | undefined): GuardMode | null {
  if (value === true) return 'guarded';
  if (value === false) return 'standard';
  return null;
}

/**
 * Resolve the mode for one bulk run.
 *
 * Never throws: a settings backend that is down must not take the bulk path down with
 * it. A failed read falls back to the default and says so in `reason`, so the operator
 * sees that the buyer's setting was not consulted rather than silently getting standard.
 */
export async function resolveGuardMode(
  input: GuardModeResolutionInput,
): Promise<GuardModeResolution> {
  const { hasCheckpointStore, scope, settingReader, runOverride } = input;

  let mode: GuardMode = GUARD_MODE_DEFAULT;
  let source: GuardModeSource = 'default';
  let settingReadFailed = false;

  if (runOverride === 'standard' || runOverride === 'guarded') {
    mode = runOverride;
    source = 'run-override';
  } else if (settingReader) {
    try {
      const saved = normaliseSetting(await settingReader.readGuardModeEnabled(scope ?? {}));
      if (saved !== null) {
        mode = saved;
        source = 'buyer-setting';
      }
    } catch {
      settingReadFailed = true;
    }
  }

  if (mode === 'guarded' && !hasCheckpointStore) {
    return {
      mode: 'guarded',
      source,
      refused: true,
      code: 'GUARD_MODE_NO_CHECKPOINT_STORE',
      reason: GUARD_MODE_COPY.refusedNoCheckpointStore,
    };
  }

  if (settingReadFailed) {
    return {
      mode,
      source,
      refused: false,
      code: 'GUARD_MODE_SETTING_UNAVAILABLE',
      reason: `The saved guard-mode setting could not be read, so this run used the default (${mode}).`,
    };
  }

  const because =
    source === 'run-override'
      ? 'this run explicitly requested it'
      : source === 'buyer-setting'
        ? 'it is the saved setting for this workspace'
        : 'no guard-mode setting is configured, so the default applies';

  return {
    mode,
    source,
    refused: false,
    code: 'GUARD_MODE_RESOLVED',
    reason: `Running in ${mode} mode because ${because}.`,
  };
}

/** Convenience for surfaces that only need the one-line explanation of a mode. */
export function describeGuardMode(mode: GuardMode): string {
  return mode === 'guarded'
    ? GUARD_MODE_COPY.guardedSummary
    : GUARD_MODE_COPY.standardSummary;
}
