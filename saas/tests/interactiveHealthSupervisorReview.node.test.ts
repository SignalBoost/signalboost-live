import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('critical health evidence stages before connector, diagnosis or repair execution', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { registerHooks } from 'node:module';
    const target=${JSON.stringify(new URL('../self-healing-host/native-autonomous-loop.ts', import.meta.url).href)};
    const modules={};
    const text=readFileSync(new URL(target),'utf8');
    for(const match of text.matchAll(/import (?!type\\b)\\{([\\s\\S]*?)\\} from ['"]([^'"]+)['"]/g)){
      const names=match[1].split(',').map(name=>name.trim()).filter(name=>name && !name.startsWith('type '));
      modules[match[2]]=names.map(name=>{
        const parts=name.split(/\\s+as\\s+/);const exported=parts[0];
        return exported==='cosServiceDb' ? 'export function cosServiceDb(){return null}'
          : 'export function '+exported+'(){throw Error("unexpected operational call: '+exported+'")}';
      }).join(';');
    }
    registerHooks({
      resolve(specifier,context,next){return modules[specifier]?{url:'mock:'+specifier,shortCircuit:true}:next(specifier,context)},
      load(url,context,next){return url.startsWith('mock:')?{format:'module',source:modules[url.slice(5)],shortCircuit:true}:next(url,context)}
    });
    const {remediateNativeIncidents}=await import(target);
    const result=await remediateNativeIncidents([{
      incidentId:'health-review',provider:'signalboost-platform',environment:'production',severity:'critical',
      detectedAt:'2026-10-11T00:00:00Z',source:'cron',errorMessage:'Critical abort rate',
      evidence:[{evidenceId:'sample',type:'health',capturedAt:'2026-10-11T00:00:00Z',summary:'Observed aborts'}],
      metadata:{nativeProbe:'cos_interactive_model_health',automaticRepairAuthorized:false}
    }]);
    assert.equal(result.length,1);
    assert.equal(result[0].outcome,'staged');
    assert.equal(result[0].repairSteps,0);
  `
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' }))
})
