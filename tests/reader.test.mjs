import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseState, parseAudit, mergeEvents, projectState, readSnapshot, readArtifact, readInside } from '../server/reader.mjs';
import { createHandler } from '../server/api.mjs';

const graph = [{ slug: 'functional-design', phase: 'construction', lead_agent: 'aidlc-architect-agent', support_agents: ['aidlc-developer-agent'], reviewer: 'aidlc-architecture-reviewer-agent', mode: 'inline' }];
const state = (marker = '-', extra = '') => `# State\n- **Status**: Running\n- **Current Stage**: functional-design\n- **Lifecycle Phase**: CONSTRUCTION\n- **Scope**: mvp\n- **Last Updated**: 2026-09-01T00:00:00Z\n${extra}\n### CONSTRUCTION PHASE\n- [${marker}] functional-design — EXECUTE\n- [ ] nfr-design — SKIP\n`;
const row = (type, at, data = {}) => `## ${type}\n**Timestamp**: 2026-09-01T00:00:${String(at).padStart(2,'0')}Z\n**Event**: ${type}\n${Object.entries(data).map(([key,value]) => `**${key}**: ${value}\n`).join('')}\n---\n\n`;
const event = (type, second, data = {}) => row(type, second, { Stage: 'functional-design', ...data });
const project = (text, source = state()) => projectState(parseState(source, graph), graph, parseAudit(text, 'local.md'), Date.parse('2026-09-06T00:00:00Z'));

test('SKIP is excluded even with an empty checkbox; old Running does not imply liveness', () => {
  const snapshot = project(event('STAGE_STARTED', 1));
  assert.equal(snapshot.stages[1].status, 'skipped');
  assert.equal(snapshot.activity, 'unknown');
  assert.equal(snapshot.waiting, null);
  assert.equal(snapshot.stage.unit, null);
});
test('summary checkpoint waits for a specific receipt, not a human turn or arbitrary answer', () => {
  const prefix = event('STAGE_STARTED',1) + event('DECISION_RECORDED',2,{Checkpoint:'Consolidated Summary Confirmation'});
  assert.equal(project(prefix + row('HUMAN_TURN',3)).waiting,'summary');
  assert.equal(project(prefix + event('QUESTION_ANSWERED',4)).waiting,'summary');
  const confirmed = project(prefix + event('SUMMARY_CONFIRMATION_RECORDED',5,{Details:'Looks correct'}));
  assert.equal(confirmed.waiting,null);
  assert.equal(confirmed.step,'artifact');
  assert.equal(confirmed.stage.status,'active');
});
test('an open stage gate remains awaiting approval even if a subagent completed', () => {
  const snapshot = project(event('STAGE_STARTED',1) + row('SUBAGENT_COMPLETED',2),state('?'));
  assert.equal(snapshot.waiting,'gate');
  assert.equal(snapshot.stage.status,'awaiting');
});
test('review request and result are separate, unrelated-stage and single-stage receipts ignored', () => {
  const prefix = event('STAGE_STARTED',1) + event('REVIEW_REQUESTED',2);
  const unrelated = event('REVIEW_COMPLETED',3,{Stage:'code-generation',Verdict:'READY'}) + event('REVIEW_COMPLETED',4,{Workflow:'single-stage:functional-design',Verdict:'READY'});
  assert.equal(project(prefix+unrelated).review,null);
  assert.equal(project(prefix+unrelated).step,'review');
  assert.equal(project(prefix+event('REVIEW_COMPLETED',5,{Verdict:'NOT-READY'})).review.verdict,'NOT-READY');
});
test('stage restart and gate rejection invalidate old review receipts', () => {
  const prefix = event('STAGE_STARTED',1) + event('REVIEW_COMPLETED',2,{Verdict:'READY'});
  assert.equal(project(prefix+event('STAGE_STARTED',3)).review,null);
  const revised = project(prefix+event('GATE_REJECTED',3)+event('STAGE_REVISING',4),state('R'));
  assert.equal(revised.review,null);
  assert.equal(revised.stage.status,'revising');
});
test('a known Unit does not inherit another Unit review', () => {
  const snapshot = project(event('STAGE_STARTED',1)+event('UNIT_STARTED',2,{Unit:'client'})+event('REVIEW_COMPLETED',3,{Unit:'server',Verdict:'READY'}));
  assert.equal(snapshot.stage.unit,'client');
  assert.equal(snapshot.review,null);
});
test('duplicate shard rows are deduplicated; ambiguous same-second records remain unknown', () => {
  const one = parseAudit(event('REVIEW_REQUESTED',2),'a');
  assert.equal(mergeEvents([...one,...one]).length,1);
  const events = mergeEvents([...one,...parseAudit(event('REVIEW_COMPLETED',2,{Verdict:'READY'}),'b')]);
  const snapshot = projectState(parseState(state(),graph),graph,events);
  assert.equal(snapshot.step,'unknown');
  assert.equal(snapshot.review,null);
  assert.equal(snapshot.warnings.length,1);
});
test('malformed state is rejected instead of fabricating a status', () => assert.throws(()=>parseState('garbage'),/INVALID_STATE/));

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'aidlc-sidecar-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const record=join(root,'aidlc/spaces/default/intents/260901-demo');
  await mkdir(join(record,'construction/functional-design'),{recursive:true});
  await mkdir(join(record,'audit'),{recursive:true});
  await mkdir(join(root,'.codex/tools/data'),{recursive:true});
  await writeFile(join(root,'.codex/tools/data/stage-graph.json'),JSON.stringify(graph));
  await writeFile(join(root,'aidlc/spaces/default/intents/intents.json'),JSON.stringify([{dirName:'260901-demo',slug:'demo',status:'active'}]));
  await writeFile(join(record,'aidlc-state.md'),state());
  await writeFile(join(record,'audit/local.md'),event('STAGE_STARTED',1));
  await writeFile(join(record,'construction/functional-design/functional-spec.md'),'# synthetic spec');
  return {root,record};
}
test('real file reads observe updates without writing source files',async(t)=>{
  const {root,record}=await fixture(t);
  const sourcePath=join(record,'aidlc-state.md');
  const before=await readFile(sourcePath,'utf8');
  const first=await readSnapshot(root);
  assert.equal(first.artifacts.length,1);
  assert.equal(first.stage.status,'active');
  assert.equal(await readFile(sourcePath,'utf8'),before);
  await writeFile(sourcePath,state('?'));
  assert.equal((await readSnapshot(root)).waiting,'gate');
  const artifact=await readArtifact(root,{space:'default',intent:'260901-demo'},first.artifacts[0].path);
  assert.equal(artifact.text,'# synthetic spec');
});
test('unknown intents, traversal, absolute paths, and outside symlinks cannot be read',async(t)=>{
  const {root,record}=await fixture(t);
  await writeFile(join(root,'outside.md'),'not an artifact');
  await symlink(join(root,'outside.md'),join(record,'construction/functional-design/link.md'));
  await assert.rejects(readInside(record,'../../../../outside.md'));
  await assert.rejects(readInside(record,join(root,'outside.md')),/INVALID_PATH/);
  await assert.rejects(readInside(record,'construction/functional-design/link.md'),/INVALID_PATH/);
  await assert.rejects(readSnapshot(root,{space:'default',intent:'../../bad'}),/UNKNOWN_INTENT/);
  await assert.rejects(readArtifact(root,{space:'default',intent:'260901-demo'},'../../outside.md'),/INVALID_ARTIFACT/);
  assert.equal((await readSnapshot(root)).artifacts.some(a=>a.name==='link.md'),false);
});
async function request(handler,url,headers={},method='GET') {
  let output='';
  const res={statusCode:200,headers:{},setHeader(key,value){this.headers[key]=value;},end(text){output=text;}};
  await handler({url,method,headers:{host:'127.0.0.1:4317',...headers}},res,()=>{res.statusCode=404;output='{}';});
  return {status:res.statusCode,body:JSON.parse(output),headers:res.headers};
}
test('API rejects writes, external hosts and cross-origin requests',async(t)=>{
  const {root}=await fixture(t);
  const handler=createHandler({projectRoot:root});
  assert.equal((await request(handler,'/api/aidlc/snapshot',{},'POST')).status,405);
  assert.equal((await request(handler,'/api/aidlc/snapshot',{host:'attacker.test'})).status,403);
  assert.equal((await request(handler,'/api/aidlc/snapshot',{origin:'https://attacker.test'})).status,403);
  assert.equal((await request(handler,'/api/aidlc/snapshot',{'sec-fetch-site':'cross-site'})).status,403);
  const result=await request(handler,'/api/aidlc/snapshot');
  assert.equal(result.status,200);
  assert.equal(result.body.stage.slug,'functional-design');
  assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(JSON.stringify(result.body).includes(root),false);
});
test('API reports missing configuration without exposing filesystem paths',async()=>{
  const result=await request(createHandler({}),'/api/aidlc/catalog');
  assert.equal(result.status,503);
  assert.match(result.body.error,/未設定/);
});

test('completed workflows with a cleared cursor retain the last completed stage',()=>{
  const source=state('x').replace('**Status**: Running','**Status**: Completed').replace('**Current Stage**: functional-design','**Current Stage**: none')+'\n- **Last Completed Stage**: functional-design\n';
  const snapshot=project(event('STAGE_COMPLETED',4),source);
  assert.equal(snapshot.stage.slug,'functional-design');
  assert.equal(snapshot.stage.status,'completed');
});
test('an artifact write identified by File rather than Stage invalidates old review',()=>{
  const prefix=event('STAGE_STARTED',1)+event('REVIEW_COMPLETED',2,{Verdict:'READY'});
  const snapshot=project(prefix+row('ARTIFACT_UPDATED',3,{File:'<project-dir>/aidlc/spaces/default/intents/demo/construction/functional-design/functional-spec.md'}));
  assert.equal(snapshot.review,null);
  assert.equal(snapshot.step,'artifact');
});
test('unattributed Unit review is never rolled up as a stage-wide result',()=>{
  const snapshot=project(event('STAGE_STARTED',1)+event('REVIEW_COMPLETED',2,{Unit:'unknown-unit',Verdict:'READY'}));
  assert.equal(snapshot.review,null);
});
test('generic decision events are questions, invalid summary replies cannot clear confirmation',()=>{
  assert.equal(project(event('STAGE_STARTED',1)+event('DECISION_RECORDED',2,{Decision:'Choose one',Options:'A,B'})).waiting,'questions');
  assert.equal(project(event('STAGE_STARTED',1)+event('SUMMARY_CONFIRMATION_RECORDED',2,{Details:'maybe'})).waiting,'summary');
});
test('stage jumps invalidate prior reviews and completed units are not active',()=>{
  assert.equal(project(event('REVIEW_COMPLETED',1,{Verdict:'READY'})+row('STAGE_JUMPED',2)).review,null);
  assert.equal(project(event('UNIT_STARTED',1,{Unit:'a'})+event('UNIT_COMPLETED',2,{Unit:'a'})).stage.unit,null);
});
test('a rejection simultaneous with a cross-shard review fails closed',()=>{
  const events=mergeEvents([...parseAudit(event('GATE_REJECTED',2),'a.md'),...parseAudit(event('REVIEW_COMPLETED',2,{Verdict:'READY'}),'b.md')]);
  const snapshot=projectState(parseState(state(),graph),graph,events);
  assert.equal(snapshot.review,null);
  assert.equal(snapshot.warnings.length,1);
});
test('v2 timestamp park markers and cleared markers are interpreted correctly',()=>{
  assert.equal(project('',state('-', '**Parked**: 2026-09-06T12:00:00Z')).parked,true);
  assert.equal(project('',state('-', '**Parked**: ')).parked,false);
});
test('UNIT_PAUSED remains selected and paused until explicit resume',()=>{
  const prefix=event('UNIT_STARTED',1,{Unit:'ui'})+event('UNIT_PAUSED',2,{Unit:'ui'});
  const paused=project(prefix);
  assert.equal(paused.stage.unit,'ui');
  assert.equal(paused.stage.unitPaused,true);
  assert.equal(project(prefix+event('UNIT_RESUMED',3,{Unit:'ui'})).stage.unitPaused,false);
});
test('review class follows declaration, scope cap, and override with low-wins',()=>{
  const definition=[{...graph[0],review_class:'adversarial',name:'Functional Design'}];
  const model=(override='',caps={})=>projectState(parseState(state('-',`**Review Override**: ${override}`),definition),definition,[],Date.now(),caps);
  assert.equal(model().stage.reviewer,graph[0].reviewer);
  assert.equal(model('none').stage.reviewer,null);
  assert.equal(model('adversarial',{mvp:'none'}).stage.reviewer,null);
  assert.equal(model('adversarial',{mvp:'advisory'}).stage.reviewClass,'advisory');
  assert.equal(model().stage.englishName,'Functional Design');
  assert.equal(projectState(parseState(state(),graph),graph,[]).stage.reviewer,null);
});
test('formal stage names are preserved instead of title-casing slugs',()=>{
  const definitions=[{slug:'state-init',name:'State Initialization',phase:'initialization'},{slug:'ci-pipeline',name:'CI Pipeline',phase:'construction'}];
  const parsed=parseState('**Status**: Running\n**Current Stage**: state-init\n- [-] state-init — EXECUTE\n- [ ] ci-pipeline — EXECUTE',definitions);
  assert.deepEqual(parsed.stages.map(s=>s.englishName),['State Initialization','CI Pipeline']);
});
test('snapshot reads scope caps from the installed harness metadata',async(t)=>{
  const {root}=await fixture(t);
  await mkdir(join(root,'.codex/tools/data'),{recursive:true});
  await mkdir(join(root,'.codex/scopes'),{recursive:true});
  await writeFile(join(root,'.codex/tools/data/stage-graph.json'),JSON.stringify([{...graph[0],name:'Functional Design',review_class:'adversarial'}]));
  await writeFile(join(root,'.codex/scopes/aidlc-mvp.md'),'---\nname: mvp\nreview_cap: "none"\n---\n');
  const snapshot=await readSnapshot(root);
  assert.equal(snapshot.stage.reviewer,null);
  assert.equal(snapshot.stage.reviewClass,'none');
  assert.equal(snapshot.stage.englishName,'Functional Design');
});
