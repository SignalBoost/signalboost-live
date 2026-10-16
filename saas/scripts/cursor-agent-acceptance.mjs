#!/usr/bin/env node
/** Isolated Cursor CLI coding-agent execution and host-owned acceptance.
 * No Vercel production secrets, customer files, or arbitrary host directory access.
 * CLI output is evidence, NEVER proof that tests passed.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join, relative, sep } from 'node:path'

export const REQUIRED = [
  'package.json', 'README.md', 'index.js',
  ...['catalog','cart','inventory','orders','checkout','reports','errors'].map(x=>'src/'+x+'.js'),
  ...['catalog','cart','inventory','orders','checkout'].map(x=>'test/'+x+'.test.js'),
]
export const COMMANDS = ['npm test','node --test test/*.test.js','node index.js']
const MAX_OUTPUT = 512_000

export function execute(command,args,{cwd,env,timeoutMs=180_000}={}) {
  return new Promise((done)=>{
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false})
    const started=Date.now();let stdout='',stderr='',timedOut=false,finished=false
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},timeoutMs)
    child.stdout.on('data',part=>{stdout=(stdout+String(part)).slice(-MAX_OUTPUT)})
    child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-MAX_OUTPUT)})
    function complete(code,error) {
      if(finished)return;finished=true;clearTimeout(timer)
      done({exitCode:typeof code==='number'?code:1,stdout,stderr:error?stderr+'\n'+error.message:stderr,timedOut,durationMs:Date.now()-started})
    }
    child.on('error',e=>complete(1,e));child.on('close',code=>complete(code))
  })
}
export async function listFiles(root,dir='') {
  const out=[]
  for(const ent of await readdir(join(root,dir),{withFileTypes:true})) {
    if(ent.name==='node_modules'||ent.name==='.git'||ent.name==='.cursor'||ent.name==='evidence')continue
    const p=join(dir,ent.name)
    if(ent.isDirectory())out.push(...await listFiles(root,p))
    else if(ent.isFile())out.push(p.split(sep).join('/'))
  }
  return out
}
export function cursorEvents(text) {
  const events=[];let sessionId=null
  for(const line of text.split(/\r?\n/)) {
    if(!line.trim())continue
    try {
      const record=JSON.parse(line)
      if(record && typeof record==='object') {
        if(typeof record.session_id==='string')sessionId=record.session_id
        events.push({type:record.type??'unknown',subtype:record.subtype??null,sessionId:record.session_id??null,
          durationMs:typeof record.duration_ms==='number'?record.duration_ms:null})
      }
    } catch {events.push({type:'non_json',subtype:null,sessionId:null,durationMs:null})}
  }
  return {events,sessionId}
}
export function nextCursorRepairPrompt({missing,receipts,passed}) {
  return [
    'Repair this existing workspace in place. Do not restart or delete work.',
    'Missing required files: '+JSON.stringify(missing),
    'Passed Node tests: '+passed+' (minimum 20 required).',
    ...receipts.filter(r=>r.exitCode!==0||r.timedOut).map(r=>
      'FAILED '+r.command+' exit='+r.exitCode+' timeout='+r.timedOut+
      '\nSTDOUT:\n'+r.stdout.slice(-6000)+'\nSTDERR:\n'+r.stderr.slice(-6000)),
    'Edit the source and tests to address these exact failures. Verify with actual terminal commands.'
  ].join('\n\n')
}
export async function runCursorAcceptance({root,objective,agent='agent',env=process.env,timeoutMs=240_000,maxRepairRounds=2}) {
  root=resolve(root)
  await mkdir(root,{recursive:true})
  const safeEnv={PATH:env.PATH,HOME:env.HOME,CURSOR_API_KEY:env.CURSOR_API_KEY}
  if(!safeEnv.CURSOR_API_KEY)throw new Error('cursor_api_key_required')
  const rounds=[]
  let sessionId=null
  let prompt=objective+'\nBuild the application in this working directory. Do not merely describe changes. Run and repair tests; do not claim success without actual passing commands.'
  let status='FAIL',missing=[...REQUIRED],receipts=[],passed=0
  const begin=Date.now()
  for(let round=0;round<=maxRepairRounds;round++) {
    const args=['-p','--force','--output-format','stream-json']
    if(sessionId)args.push('--resume',sessionId)
    args.push(prompt)
    const agentRun=await execute(agent,args,{cwd:root,env:safeEnv,timeoutMs})
    const parsed=cursorEvents(agentRun.stdout)
    sessionId=parsed.sessionId??sessionId
    const present=await listFiles(root)
    missing=REQUIRED.filter(p=>!present.includes(p))
    receipts=[]
    // Execute the exact acceptance commands independently, after the agent exits.
    // No remembered test result or assistant assertion can produce a PASS.
    for(const [command,cmd,args] of [
      ['npm test','npm',['test']],
      ['node --test test/*.test.js','node',['--test',...REQUIRED.filter(p=>p.startsWith('test/'))]],
      ['node index.js','node',['index.js']]
    ]) {
      const execution=await execute(cmd,args,{cwd:root,env:{PATH:env.PATH,HOME:env.HOME},timeoutMs:120_000})
      receipts.push({command,...execution})
    }
    const matches=[...receipts[0].stdout.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/g)]
    passed=matches.length?Number(matches.at(-1)[1]):0
    status=missing.length===0 && receipts.every(r=>r.exitCode===0&&!r.timedOut) && passed>=20?'PASS':'FAIL'
    rounds.push({index:round,agent:{exitCode:agentRun.exitCode,timedOut:agentRun.timedOut,durationMs:agentRun.durationMs,
      stderr:agentRun.stderr.slice(-8000),sessionId:parsed.sessionId,events:parsed.events},status,missing,testsPassed:passed,receipts})
    // Persist every attempt so interrupted or unsuccessful runs retain real evidence.
    await mkdir(join(root,'evidence'),{recursive:true})
    await writeFile(join(root,'evidence','acceptance.json'),JSON.stringify({
      schema:'itmounts.cursor.acceptance.v2',status,root,required:REQUIRED.length,present:REQUIRED.length-missing.length,
      missing,testsPassed:passed,elapsedMs:Date.now()-begin,sessionId,rounds
    },null,2))
    if(status==='PASS')break
    if(round===maxRepairRounds||!sessionId||agentRun.timedOut||agentRun.exitCode!==0)break
    prompt=nextCursorRepairPrompt({missing,receipts,passed})
  }
  return {schema:'itmounts.cursor.acceptance.v2',status,root,required:REQUIRED.length,
    present:REQUIRED.length-missing.length,missing,testsPassed:passed,sessionId,rounds,receipts}
}
if(process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const root=process.argv[2], objectivePath=process.argv[3]
  if(!root||!objectivePath){console.error('Usage: node scripts/cursor-agent-acceptance.mjs /absolute/isolated/workspace /absolute/objective.txt');process.exit(2)}
  try {
    const evidence=await runCursorAcceptance({root,objective:await readFile(objectivePath,'utf8')})
    console.log(JSON.stringify({status:evidence.status,present:evidence.present,missing:evidence.missing,testsPassed:evidence.testsPassed,commands:evidence.receipts.map(r=>({command:r.command,exitCode:r.exitCode,timedOut:r.timedOut}))}))
    process.exit(evidence.status==='PASS'?0:1)
  } catch(e){console.error(String(e));process.exit(2)}
}
