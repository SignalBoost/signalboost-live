from pathlib import Path

ROUTE = Path('saas/app/api/support/routeCoreLegacy.ts')
ONBOARD = Path('ONBOARD.md')


def patch_route() -> None:
    text = ROUTE.read_text()

    old_import = "import { consultSpecialistCrew, COS_SPECIALIST_ROLES } from '@/lib/ai/cos/specialistCrewClient'\n"
    new_import = (
        "import { COS_SPECIALIST_ROLES } from '@/lib/ai/cos/specialistCrewClient'\n"
        "import { runCOSSpecialistCrewMission } from '@/lib/ai/cos/specialistCrewMission'\n"
    )
    if old_import in text:
        text = text.replace(old_import, new_import, 1)
    elif "runCOSSpecialistCrewMission" not in text:
        raise SystemExit('CrewAI specialist import anchor not found')

    old_call = """      const result = await consultSpecialistCrew({
        objective,
        roles: roles as any,
        evidence: typeof args?.evidence === 'string' ? args.evidence : undefined,
        constraints: typeof args?.constraints === 'string' ? args.constraints : undefined,
      })
      if (!result.ok) {
        return `Specialist crew unavailable (${result.status}): ${result.error || 'no advisory result returned'}. No hosted fallback or external action was attempted.`
      }
      return [
        `CREWAI ADVISORY RECEIPT — mission ${result.mission_id || 'unknown'}; roles ${(result.roles || roles).join(', ')}; side effects: NOT ALLOWED; durable CrewAI memory: NOT USED.`,
        result.report || 'The specialist crew returned no report body.',
      ].join('\\n\\n')
"""
    new_call = """      const mission = await runCOSSpecialistCrewMission({
        objective,
        roles: roles as any,
        evidence: typeof args?.evidence === 'string' ? args.evidence : undefined,
        constraints: typeof args?.constraints === 'string' ? args.constraints : undefined,
      })
      const result = mission.result
      if (mission.status !== 'verified' || !result.ok) {
        return `Specialist crew unavailable/unverified (${result.status}; LangGraph ${mission.status}): ${mission.reason || result.error || 'no verified advisory result returned'}. No hosted fallback or external action was attempted.`
      }
      return [
        `CREWAI ADVISORY RECEIPT — LangGraph ${mission.status}; mission ${result.mission_id || 'unknown'}; attempts ${mission.attempts}; roles ${(result.roles || roles).join(', ')}; side effects: NOT ALLOWED; durable CrewAI memory: NOT USED.`,
        result.report || 'The specialist crew returned no report body.',
      ].join('\\n\\n')
"""
    if old_call in text:
        text = text.replace(old_call, new_call, 1)
    elif "const mission = await runCOSSpecialistCrewMission" not in text:
        raise SystemExit('CrewAI runTool call anchor not found')

    ROUTE.write_text(text)


def patch_onboard() -> None:
    text = ONBOARD.read_text()
    old = """CrewAI `1.15.21` is integrated underneath COS as the specialist-collaboration layer, not as a second control plane. The existing Python `cos-ai-department` now has a `crew-coordinator` service that can assemble 1–5 registered specialists for bounded analysis/review/recommendation missions. COS exposes this through the private `consultSpecialistCrew` tool. CrewAI has no owner tools and may not deploy, change permissions, access secrets, spend money, contact third parties, override Referee/COS governance, award University credit, or persist its own durable memory. Enterprise Memory and the existing COS/Referee/audit stack remain authoritative.

The CrewAI coordinator fails closed unless explicitly configured with a private/internal inference endpoint and model. Public hosted coordinator/model endpoints are rejected and no silent OpenAI/Anthropic fallback is permitted. Crew memory and cache are disabled; mission context is ephemeral. Repository implementation and CI are not Production proof: a Production claim additionally requires the coordinator image/service, private inference configuration, the COS bridge configuration, and a real recorded owner/admin specialist-crew receipt from the running deployment.
"""
    new = """CrewAI `1.15.21` is integrated underneath COS as the specialist-collaboration layer, not as a second control plane. The existing Python `cos-ai-department` now has a `crew-coordinator` service that can assemble 1–5 registered specialists for bounded analysis/review/recommendation missions. COS exposes this through the private `consultSpecialistCrew` tool. Every COS specialist consultation is wrapped by the existing bounded LangGraph mission runtime as `plan -> execute CrewAI -> verify`, so the implemented chain is COS -> LangGraph -> CrewAI -> specialists -> verified advisory result. Specialist missions are deliberately single-attempt: an expensive second crew run must be a new COS decision, never an automatic retry.

CrewAI has no owner tools and may not deploy, change permissions, access secrets, spend money, contact third parties, override Referee/COS governance, award University credit, or persist its own durable memory. LangGraph verification rejects a changed specialist roster, any authority expansion, durable CrewAI memory, a failed private-inference call, or a missing advisory report. Enterprise Memory and the existing COS/Referee/audit stack remain authoritative.

The CrewAI coordinator fails closed unless explicitly configured with a private/internal inference endpoint and model. Public hosted coordinator/model endpoints are rejected and no silent OpenAI/Anthropic fallback is permitted. Crew memory and cache are disabled; mission context is ephemeral. Repository implementation and CI are not Production proof: a Production claim additionally requires the coordinator image/service, private inference configuration, the COS bridge configuration, and a real recorded owner/admin specialist-crew receipt from the running deployment.
"""
    if old in text:
        text = text.replace(old, new, 1)
    elif 'COS -> LangGraph -> CrewAI -> specialists' not in text:
        raise SystemExit('CrewAI ONBOARD anchor not found')
    ONBOARD.write_text(text)


if __name__ == '__main__':
    patch_route()
    patch_onboard()
