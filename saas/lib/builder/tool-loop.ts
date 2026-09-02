      if (action.type === 'answer') {
        if (repairObjective) {
          const listed = await this.workspace.listFiles(input.workspaceId)
          workspacePaths = listed.map(file => file.path)
          const files = (await Promise.all(listed.map(file => this.workspace.readFile(input.workspaceId, file.path))))
            .filter((file): file is BuilderFile => file !== null)
          const proofFile = files.find(file => /builderAsyncJobs|builderDebugFileJob|builderRoutingStrict/.test(file.path))
            || files.find(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file.path))
          const proofCommand = proofFile
            ? `node --experimental-strip-types --test ${proofFile.path}`
            : (projectContext.recommendedTestCommand || '')
          const proofIdx = trace
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.toolId === 'run' && text(item.input.command) === proofCommand)
          const failedProof = proofIdx.find(({ item }) => !item.ok)
          const passedProof = proofIdx.find(({ item }) => item.ok)
          const verifiedAfterFail = failedProof
            ? proofIdx.some(({ item, index }) => item.ok && index > failedProof.index)
            : false
          const edited = trace.some(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))

          if (proofCommand && !failedProof && !passedProof) {
            const output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: proofCommand, files }))
            const failed = output.exitCode !== 0
            trace.push({
              round,
              toolId: 'run',
              input: { command: proofCommand },
              ok: !failed,
              output,
              ...(failed ? { error: `builder_command_failed: exit ${output.exitCode}`, failureClass: 'test' as const } : {}),
            })
            runCount += 1
            continue
          }
          if (proofCommand && failedProof && edited && !verifiedAfterFail) {
            const output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: proofCommand, files }))
            const failed = output.exitCode !== 0
            trace.push({
              round,
              toolId: 'run',
              input: { command: proofCommand },
              ok: !failed,
              output,
              ...(failed ? { error: `builder_command_failed: exit ${output.exitCode}`, failureClass: 'test' as const } : {}),
            })
            runCount += 1
            if (!failed) return { ok: true, answer: action.answer, trace }
            continue
          }
          if (passedProof && !failedProof && !edited) {
            return { ok: false, error: 'builder_regression_not_reproduced', trace }
          }
        }
        const verdict = evaluateRegressionGate(input.objective, trace)
        if (verdict.satisfied) return { ok: true, answer: action.answer, trace }
        const reason = 'reason' in verdict ? verdict.reason : 'regression evidence is required'
        gateNudges += 1
        if (gateNudges > MAX_GATE_NUDGES) return { ok: false, error: 'builder_regression_evidence_required', trace }
        continue
      }
