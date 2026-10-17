import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {BuilderV2Agent} from '../lib/builder/agent-v2.ts'
import {BuilderV2Dispatcher} from '../lib/builder/agent-v2-dispatcher.ts'
import {InMemoryBuilderWorkspace} from '../lib/builder/workspace.ts'

const objective=[
 'Create these files:',
 '- app.js',
 '- app.test.js',
 'Run:',
 'node --test app.test.js',
 'Write at least 1 tests.',
 'Browser verify https://itmounts.com.',
].join('\n')
const action=(tool:string,fields:Record<string,unknown>)=>JSON.stringify({type:'tool',action:{tool,...fields}})
const realNode={
 async run({files,command}:{files:readonly {path:string;content:string}[];command:string}){
  assert.equal(command,'node --test app.test.js')
  const dir=mkdtempSync(join(tmpdir(),'v2-full-rea-'))
  try{
   for(const file of files){const path=join(dir,file.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,file.content)}
   const {status,stdout,stderr,error}=spawnSync(process.execPath,['--test','app.test.js'],{
    cwd:dir,encoding:'utf8',timeout:8000,
    env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='NODE_TEST_CONTEXT'))
   })
   return {exitCode:status??124,stdout:stdout||'',stderr:stderr||'',timedOut:Boolean(error)}
  }finally{rmSync(dir,{recursive:true,force:true})}
 }
}
test('V2 builds, fails, checkpoints, repairs with real Node, verifies browser and delivers',async()=>{
 const workspace=new InMemoryBuilderWorkspace()
 const browserEvents:string[]=[]
 const browser={
  async capabilities(){return {actions:['open','goto','snapshot','find','console','requests','close'] as const,
   allowedOrigins:['https://itmounts.com']}},
  async invoke(input:{action:'open'|'goto'|'snapshot'|'find'|'console'|'requests'|'close'}){
   browserEvents.push(input.action)
   return {ok:true,action:input.action,exitCode:0,stdout:'page snapshot',stderr:'',timedOut:false}
  },
  async close(){}
 }
 const dispatcher=new BuilderV2Dispatcher(workspace,realNode,undefined,browser)
 const startReplies=[
  action('write_file',{path:'app.js',content:'module.exports=()=>1\n'}),
  action('write_file',{path:'app.test.js',content:
   "const test=require('node:test');const assert=require('node:assert/strict');test('value',()=>assert.equal(require('./app.js')(),2));\n"}),
 ]
 const start=new BuilderV2Agent({async generate(){return startReplies.shift()??null}},dispatcher,workspace)
 const paused=await start.run({workspaceId:'rea-v2',objective,maxSteps:2})
 assert.equal(paused.ok,false)
 assert.ok(paused.checkpoint,'durable checkpoint expected after first failing test')
 assert.ok(paused.steps.some(x=>x.tool==='run_tests'&&!x.ok),'real Node failure was recorded')
 const resumes=[
  action('edit_file',{path:'app.js',search:'()=>1',replace:'()=>2'}),
  action('browser_cli',{action:'open',url:'https://itmounts.com'}),
  action('browser_cli',{action:'snapshot'}),
  JSON.stringify({type:'finish',summary:'complete'}),
 ]
 const resume=new BuilderV2Agent({async generate(){return resumes.shift()??null}},dispatcher,workspace)
 const done=await resume.run({workspaceId:'rea-v2',objective,checkpoint:paused.checkpoint,maxSteps:12})
 assert.equal(done.ok,true,done.reason)
 assert.deepEqual(browserEvents,['open','snapshot'])
 const runs=done.steps.filter(x=>x.tool==='run_tests')
 assert.deepEqual(runs.map(x=>x.ok),[false,true])
 assert.equal((await workspace.readFile('rea-v2','app.js'))?.content,'module.exports=()=>2\n')
 assert.equal(done.steps.filter(x=>x.tool==='browser_cli'&&x.ok).length,2)
 assert.ok(done.checkpoint)
 const recovered=new BuilderV2Agent({async generate(){throw Error('no model call expected')}},dispatcher,workspace)
 const replay=await recovered.run({workspaceId:'rea-v2',objective,checkpoint:done.checkpoint,maxSteps:1})
 assert.equal(replay.ok,true,replay.reason)
 assert.equal(replay.steps.filter(x=>x.tool==='run_tests').length,2)
})
