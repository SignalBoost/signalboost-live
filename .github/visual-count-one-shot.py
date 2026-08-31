from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'expected block not found in {path}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'saas/lib/visuals/intent.ts',
    """  return [...found.values()]\n    .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))\n    .slice(0, 4)\n    .map((candidate) => candidate.name)\n""",
    """  return [...found.values()]\n    .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))\n    .map((candidate) => candidate.name)\n""",
)

replace_once(
    'saas/lib/visuals/referenceImageGeneration.ts',
    """}): Promise<ReferenceConditionedImageResult> {\n  const references = input.references.slice(0, 4)\n  if (!references.length) return { ok: false, error: 'No verified person references were supplied.' }\n\n  const key = approvedRuntimeKey()\n""",
    """}): Promise<ReferenceConditionedImageResult> {\n  if (input.references.length > 4) {\n    return { ok: false, error: 'Identity-verified generation supports at most four people per image.' }\n  }\n  const references = [...input.references]\n  if (!references.length) return { ok: false, error: 'No verified person references were supplied.' }\n\n  const key = approvedRuntimeKey()\n""",
)

replace_once(
    'saas/app/api/visuals/route.ts',
    """function verificationFailureReply(language: VisualLanguage, people: boolean): string {\n""",
    """function unsupportedPeopleCountReply(language: VisualLanguage, count: number): string {\n  return {\n    en: `This visual names ${count} people, but identity-verified generation supports at most four at once. I did not drop or substitute anyone. Request four or fewer people.`,\n    es: `Esta imagen nombra a ${count} personas, pero la generación con identidad verificada admite como máximo cuatro a la vez. No eliminé ni sustituí a nadie. Solicita cuatro personas o menos.`,\n    pt: `Esta imagem nomeia ${count} pessoas, mas a geração com identidade verificada aceita no máximo quatro por vez. Não removi nem substituí ninguém. Peça quatro pessoas ou menos.`,\n    pl: `Ten obraz wymienia ${count} osób, ale generowanie ze zweryfikowaną tożsamością obsługuje najwyżej cztery osoby naraz. Nikogo nie pominąłem ani nie zastąpiłem. Poproś o maksymalnie cztery osoby.`,\n    ru: `В запросе указано ${count} человек, но генерация с проверкой личности поддерживает не более четырёх одновременно. Я никого не удалял и не заменял. Укажите не более четырёх человек.`,\n  }[language]\n}\n\nfunction verificationFailureReply(language: VisualLanguage, people: boolean): string {\n""",
)

replace_once(
    'saas/app/api/visuals/route.ts',
    """    } else if (classification.requestType === 'named-person' || classification.requestType === 'multiple-named-people') {\n      const requestedPeople = [...classification.referencePeople].slice(0, 4)\n      const resolved = await Promise.all(requestedPeople.map((person) => resolveVerifiedPersonReference(person)))\n""",
    """    } else if (classification.requestType === 'named-person' || classification.requestType === 'multiple-named-people') {\n      const requestedPeople = [...classification.referencePeople]\n      if (requestedPeople.length > 4) {\n        trace(traceId, 'final-decision', {\n          decision: 'blocked',\n          reason: 'visual_people_count_unsupported',\n          requestedPeopleCount: requestedPeople.length,\n          maxPeople: 4,\n        })\n        return NextResponse.json({\n          error: 'visual_people_count_unsupported',\n          reply: unsupportedPeopleCountReply(language, requestedPeople.length),\n          source: 'concierge-visual-people-count-unsupported',\n          trace_id: traceId,\n          request_type: classification.requestType,\n          execution_allowed: false,\n          external_action_taken: false,\n          requested_people: requestedPeople,\n          requested_people_count: requestedPeople.length,\n          max_people: 4,\n          failed_entities: requestedPeople,\n        }, { status: 422 })\n      }\n      const resolved = await Promise.all(requestedPeople.map((person) => resolveVerifiedPersonReference(person)))\n""",
)

Path('.github/visual-count-one-shot.py').unlink(missing_ok=True)
Path('.github/workflows/visual-count-one-shot.yml').unlink(missing_ok=True)
