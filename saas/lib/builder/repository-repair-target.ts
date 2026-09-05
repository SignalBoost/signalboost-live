  return [
    target.trigger === 'failed_build_log'
      ? `Repair the failed ${target.repository} build at exact commit ${target.fullCommitSha || target.commitSha}.`
      : `Diagnose and prepare a verified repair for ${target.repository} at exact deployed commit ${target.fullCommitSha || target.commitSha}.`,
    `The host mounted the pinned repository's ${target.projectRoot}/ directory as this isolated workspace. Tool paths are relative to ${target.projectRoot}/.`,
    'Inspect the implicated source, reproduce the failure with the narrowest relevant command, make the smallest source repair, and rerun the same command until it passes.',
    // History is evidence. A missing property, a deleted import, or a signature that no longer
    // matches its callers is usually something a recent commit removed, and the current file
    // cannot show that. Reading the change is faster and more truthful than inferring intent.
    'The mounted repository carries recent history. When a failure is a contract, type, or missing-symbol mismatch, first run `git log --oneline -15 -- <file>` and `git show <sha> -- <file>` on the implicated file and read what the recent commits removed. If a commit deleted the property, import, or branch the failure names, restore it from `git show <sha>^:<file>` rather than writing a replacement from scratch. Report the commit you found. These git commands are read-only; committing, pushing, and merging remain forbidden.',
    narrowProof,
    'Do not weaken tests, access another repository, use the network, commit, push, merge, deploy, or claim success without fail-before/pass-after evidence.',
    command,
    paths.length ? `Path hints: ${paths.join(', ')}` : '',
    target.symbolHints.length ? `Symbol hints: ${target.symbolHints.join(', ')}` : '',
    `Failure evidence:\n${evidence}`,
  ].filter(Boolean).join('\n\n').slice(0, 7_900)
}
