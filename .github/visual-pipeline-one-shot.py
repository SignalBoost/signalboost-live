from pathlib import Path

path = Path('saas/tests/conciergeVisuals.node.test.ts')
text = path.read_text(encoding='utf-8')
old = """  assert.match(browserRoute, /isConciergeVisualObjective\\(prompt\\)/)\n  assert.match(browserRoute, /inlineVisualResponse\\(await visualPost\\(visualRequest\\)\\)/)\n  assert.match(browserRoute, /visual:\\s*\\{[\\s\\S]*previewUrl/)\n  assert.match(home, /data-concierge-visual-preview=\"true\"/)\n  assert.match(home, /src=\\{turn\\.visualPreviewUrl\\}/)\n\n  assert.match(visualRoute, /intent\\.mode === 'reference-people'/)\n  assert.match(visualRoute, /resolveVerifiedPersonReference/)\n  assert.match(visualRoute, /generateReferenceConditionedImage/)\n  assert.match(visualRoute, /verifyReferenceConditionedPeopleImage/)\n  assert.match(visualRoute, /synthetic_media: isPeopleVisual/)\n  assert.doesNotMatch(visualRoute, /reference-people[\\s\\S]{0,1400}createPlatformImagePort\\(\\)\\.generate/)\n"""
new = """  assert.match(browserRoute, /classifyVisualRequest\\(/)\n  assert.match(browserRoute, /hasUserReferenceImage\\(body\\)/)\n  assert.match(browserRoute, /inlineVisualResponse\\(await visualPost\\(visualRequest\\), appendPreviewToReply\\)/)\n  assert.match(browserRoute, /visual:\\s*\\{[\\s\\S]*previewUrl/)\n  assert.match(home, /data-concierge-visual-preview=\"true\"/)\n  assert.match(home, /src=\\{turn\\.visualPreviewUrl\\}/)\n\n  assert.match(visualRoute, /classification\\.requestType === 'named-person'/)\n  assert.match(visualRoute, /classification\\.requestType === 'multiple-named-people'/)\n  assert.match(visualRoute, /resolveVerifiedPersonReference/)\n  assert.match(visualRoute, /generateReferenceConditionedImage/)\n  assert.match(visualRoute, /verifyReferenceConditionedPeopleImage/)\n  assert.match(visualRoute, /synthetic_media: isGenerated/)\n  assert.doesNotMatch(visualRoute, /classification\\.requestType === '(?:named-person|multiple-named-people)'[\\s\\S]{0,1400}createPlatformImagePort\\(\\)\\.generate/)\n"""
if old not in text:
    raise SystemExit('expected concierge visual assertion block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')

Path('.github/visual-pipeline-one-shot.py').unlink(missing_ok=True)
Path('.github/workflows/visual-pipeline-one-shot.yml').unlink(missing_ok=True)
