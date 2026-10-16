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
export async function runCursorAcceptance({root,objective,agent='agent',env=process.env,timeoutMs=900_000}) {
  root=resolve(root)
  await mkdir(root,{recursive:true})
  const safeEnv={PATH:env.PATH,HOME:env.HOME,CURSOR_API_KEY:env.CURSOR_API_KEY}
  if(!safeEnv.CURSOR_API_KEY)throw new Error('cursor_api_key_required')
  const prompt=objective+'\nBuild the application in this working directory. Do not merely describe changes. Run and repair tests; do not claim success without actual passing commands.'
  const agentRun=await execute(agent,['-p','--force','--output-format','stream-json',prompt],{cwd:root,env:safeEnv,timeoutMs})
  const parsed=cursorEvents(agentRun.stdout)
  const present=await listFiles(root)
  const missing=REQUIRED.filter(p=>!present.includes(p))
  const receipts=[]
  // Independently run tests AFTER Cursor is finished. A model statement is never a verification receipt.
  for(const [cmd,args] of [['npm',['test']],['node',['--test',...REQUIRED.filter(p=>p.startsWith('test/'))]],['node',['index.js']]]) {
    const execution=await execute(cmd,args,{cwd:root,env:{PATH:env.PATH,HOME:env.HOME},timeoutMs:120_000})
    receipts.push({command:cmd+' '+args.join(' '),...execution})
  }
  const testOutput=receipts[0].stdout
  const matches=[...testOutput.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/g)]
  const passed=matches.length?Number(matches.at(-1)[1]):0
  const status=missing.length===0 && receipts.every(r=>r.exitCode===0&&!r.timedOut) && passed>=20?'PASS':'FAIL'
  const evidence={schema:'itmounts.cursor.acceptance.v1',status,root,required:REQUIRED.length,present:REQUIRED.length-missing.length,missing,
    testsPassed:passed,agent:{exitCode:agentRun.exitCode,timedOut:agentRun.timedOut,durationMs:agentRun.durationMs,
      stderr:agentRun.stderr.slice(-8000),sessionId:parsed.sessionId,events:parsed.events},receipts}
  await mkdir(join(root,'evidence'),{recursive:true})
  await writeFile(join(root,'evidence','acceptance.json'),JSON.stringify(evidence,null,2))
  return evidence
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
