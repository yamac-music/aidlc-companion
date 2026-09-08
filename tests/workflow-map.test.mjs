import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { parseState } from '../server/reader.mjs';
const require = createRequire(import.meta.url);
function load(path) {
  const source = readFileSync(new URL(path, import.meta.url),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  runInNewContext(code,{exports,require:(name)=>name==='../lib/workflow'?load('../lib/workflow.ts'):require(name)});
  return exports;
}
const {WorkflowMap,LocationSummary}=load('../components/workflow-map.tsx');
const base={workflowStatus:'Running',parked:false,stage:{slug:'functional-design',phase:'construction',lead:'aidlc-architect-agent'},stages:[
  {slug:'delivery-planning',name:'実行計画',englishName:'Delivery Planning',phase:'inception',status:'completed',lead:'aidlc-delivery-agent'},
  {slug:'functional-design',name:'機能設計',englishName:'Functional Design',phase:'construction',status:'active',lead:'aidlc-architect-agent'},
  {slug:'nfr-design',name:'品質設計',englishName:'NFR Design',phase:'construction',status:'skipped',lead:'aidlc-architect-agent'},
  {slug:'code-generation',name:'コード作成',englishName:'Code Generation',phase:'construction',status:'pending',lead:'aidlc-developer-agent'},
]};
const render=(Component,snapshot)=>renderToStaticMarkup(createElement(Component,{snapshot}));
test('location counts only included stages without presenting a completion percentage',()=>{
  assert.match(render(LocationSummary,base),/対象2工程の1番目/);
  assert.doesNotMatch(render(LocationSummary,base),/%/);
});
test('map groups phases and includes every stage, original name, owner and current marker',()=>{
  const html=render(WorkflowMap,base);
  assert.equal((html.match(/<section/g)||[]).length,2);
  assert.equal((html.match(/<li /g)||[]).length,4);
  for(const label of ['Functional Design','担当：設計担当','担当：開発担当','担当：計画担当','現在 · 進行中','実行なし']) assert.ok(html.includes(label),label);
  assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
  assert.match(html,/0 \/ 2 完了/);
  assert.doesNotMatch(html,/<button|<input|<select/);
});
test('paused and completed workflows have explicit labels without claiming active work',()=>{
  assert.match(render(WorkflowMap,{...base,parked:true}),/現在 · 保留/);
  const done={...base,workflowStatus:'Completed'};
  assert.doesNotMatch(render(WorkflowMap,done),/aria-current="step"/);
  assert.match(render(LocationSummary,done),/最終工程/);
});
test('reader supplies owner from stage definition; unknown definitions remain unknown',()=>{
  const source='**Status**: Running\n**Current Stage**: functional-design\n- [-] functional-design — EXECUTE';
  assert.equal(parseState(source,[{slug:'functional-design',lead_agent:'aidlc-architect-agent'}]).stages[0].lead,'aidlc-architect-agent');
  assert.equal(parseState(source).stages[0].lead,null);
});
