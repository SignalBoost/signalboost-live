import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const required = ['package.json','README.md','index.js','src/catalog.js','src/cart.js','src/inventory.js','src/orders.js','src/checkout.js','src/reports.js','src/errors.js','test/catalog.test.js','test/cart.test.js','test/inventory.test.js','test/orders.test.js','test/checkout.test.js']
const [objectiveFile, workspaceArg, evidenceArg] = process.argv.slice(2)
if (!objectiveFile || !workspaceArg || !evidenceArg) {
  console.error('Usage: node tools/codex-orderflow-acceptance.mjs <objective.md> <workspace> <evidence>')
  process.exit(2)
}
const workspace = resolve(workspaceArg), evidence = resolve(evidenceArg)
mkdirSync(workspace,{recursive:true}); mkdirSync(evidence,{recursive:true})
const report = {status:'INCOMPLETE',filesPresent:0,tests:{executed:0,passed:0,failed:0},commands:[],codex:null,errors:[]}
const save = () => writeFileSync(join(evidence,'acceptance.json'),JSON.stringify(report,null,2)+'\n')
const run = (bin,args,stdin,basename,timeoutMs) => new Promise(done => {
  const child = spawn(bin,args,{cwd:workspace,stdio:['pipe','pipe','pipe']})
  let stdout='',stderr='',timedOut=false
  child.stdout.on('data',chunk => { stdout+=chunk; writeFileSync(join(evidence,basename+'.stdout.log'),stdout) })
  child.stderr.on('data',chunk => { stderr+=chunk; writeFileSync(join(evidence,basename+'.stderr.log'),stderr) })
  child.stdin.end(stdin||'')
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM')},timeoutMs)
  child.on('error',err=>{stderr+=String(err)})
  child.on('close',code=>{clearTimeout(timer);done({exitCode:code,timedOut,stdout,stderr})})
})
try {
  save()
  const binary=process.env.CODEX_BIN||'codex'
  const probe=spawnSync(binary,['--version'],{encoding:'utf8',timeout:10000})
  if(probe.error || probe.status!==0) throw new Error('Codex CLI unavailable: '+(probe.error?.message||probe.stderr||'unknown error'))
  const objective=readFileSync(resolve(objectiveFile),'utf8')
  writeFileSync(join(evidence,'objective.sha256'),createHash('sha256').update(objective).digest('hex')+'\n')
  const cmd=['exec','--json','--sandbox','workspace-write','--skip-git-repo-check','-C',workspace,'-']
  const agent=await run(binary,cmd,'Implement this task, write complete files, run tests, repair failures.\n\n'+objective,'codex',Number(process.env.CODEX_ACCEPTANCE_TIMEOUT_MS||600000))
  report.codex={exitCode:agent.exitCode,timedOut:agent.timedOut,version:probe.stdout.trim()}
  writeFileSync(join(evidence,'codex.events.jsonl'),agent.stdout)
  save()
  report.filesPresent=required.filter(path=>existsSync(join(workspace,path))).length
  if(report.filesPresent!==15) report.errors.push('Missing: '+required.filter(p=>!existsSync(join(workspace,p))).join(', '))
  const commands=[['npm',['test']],['node',['--test',...required.filter(p=>p.startsWith('test/'))]],['node',['index.js']]]
  for(let i=0;i<commands.length;i++){
    const [bin,args]=commands[i],output=await run(bin,args,'','verify-'+(i+1),120000)
    report.commands.push({command:i===1?'node --test test/*.test.js':[bin,...args].join(' '),actualCommand:[bin,...args].join(' '),exitCode:output.exitCode,timedOut:output.timedOut})
    if(i===0){
      const count=k=>Number(output.stdout.match(new RegExp('(?:^|\\n)\\s*(?:#|ℹ)\\s+'+k+'\\s+(\\d+)'))?.[1]||0)
      report.tests={executed:count('tests'),passed:count('pass'),failed:count('fail')}
    }
    save()
  }
  report.status=report.filesPresent===15 && report.tests.executed>=20 && report.tests.passed===report.tests.executed && report.tests.failed===0 && report.codex.exitCode===0 && !report.codex.timedOut && report.commands.every(c=>c.exitCode===0&&!c.timedOut)?'PASS':'INCOMPLETE'
  writeFileSync(join(evidence,'sha256.txt'),required.filter(p=>existsSync(join(workspace,p))).map(p=>createHash('sha256').update(readFileSync(join(workspace,p))).digest('hex')+'  '+p).join('\n')+'\n')
  if(report.status!=='PASS')report.errors.push('Independent acceptance checks did not all pass')
  save();console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1
} catch(err){report.errors.push(String(err));save();console.error(String(err));process.exitCode=1}
