import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const names = {
  'workspace-scaffold': '作業場所の準備', 'workspace-detection': '既存環境の確認', 'state-init': '進行記録の準備',
  'intent-capture': '目的の整理', 'market-research': '市場調査', feasibility: '実現性の確認',
  'scope-definition': '範囲の決定', 'team-formation': 'チーム構成', 'rough-mockups': '画面のラフ案', 'approval-handoff': '承認と引き継ぎ',
  'reverse-engineering': '既存システムの調査', 'practices-discovery': '進め方の確認', 'requirements-analysis': '要件の整理',
  'user-stories': '利用場面の整理', 'refined-mockups': '画面の具体化', 'domain-design': '全体の設計',
  'units-generation': '作業単位の分割', 'contract-design': 'データの受け渡し設計', 'delivery-planning': '実行計画',
  'functional-design': '機能設計', 'nfr-requirements': '品質条件の整理', 'nfr-design': '品質を満たす設計',
  'infrastructure-design': '基盤設計', 'code-generation': 'コード作成', 'build-and-test': 'ビルドとテスト',
  'ci-pipeline': '自動検証の準備', 'deployment-pipeline': '配備手順の整備', 'environment-provisioning': '環境の準備',
  'deployment-execution': '配備', 'observability-setup': '監視の準備', 'incident-response': '障害対応',
  'performance-validation': '性能確認', 'feedback-optimization': '改善',
};
const markers = { ' ': 'pending', '-': 'active', '?': 'awaiting', R: 'revising', x: 'completed', S: 'skipped' };
const labels = {
  STAGE_STARTED: '工程を開始', STAGE_COMPLETED: '工程が完了', STAGE_AWAITING_APPROVAL: '工程の承認を依頼',
  STAGE_REVISING: '修正へ', GATE_APPROVED: '承認を記録', GATE_REJECTED: '修正依頼を記録', STAGE_SKIPPED: '工程をスキップ', STAGE_JUMPED: '工程の位置を変更',
  REVIEW_REQUESTED: 'レビューを依頼', REVIEW_COMPLETED: 'レビュー結果を記録', SUBAGENT_COMPLETED: 'エージェントから報告',
  QUESTION_ANSWERED: '回答を記録', DECISION_RECORDED: '確認事項を記録', SUMMARY_CONFIRMATION_RECORDED: '回答内容の確認を記録',
  ARTIFACT_CREATED: '成果物を保存', ARTIFACT_UPDATED: '成果物を更新', RULE_LEARNED: '学びを保存',
  UNIT_STARTED: '作業単位を開始', UNIT_COMPLETED: '作業単位が完了', UNIT_PAUSED: '作業単位を保留', UNIT_RESUMED: '作業単位を再開',
  SESSION_STARTED: 'セッション開始', SESSION_RESUMED: 'セッション再開', SESSION_ENDED: 'セッション終了',
  WORKFLOW_STARTED: 'ワークフロー開始', WORKFLOW_COMPLETED: 'ワークフロー完了', WORKFLOW_PARKED: 'ワークフローを保留', WORKFLOW_UNPARKED: 'ワークフローを再開',
  BOLT_STARTED: '並列作業を開始', BOLT_COMPLETED: '並列作業の完了を記録', BOLT_FAILED: '並列作業で問題を記録',
  SENSOR_FAILED: '自動確認で指摘', SENSOR_PASSED: '自動確認を通過', SWARM_STARTED: '共同作業を開始', SWARM_COMPLETED: '共同作業が完了',
};

export function fields(text) {
  return Object.fromEntries([...text.matchAll(/^\s*(?:- )?\*\*([^*\n]+)\*\*:\s*([^\n]*)/gm)].map((m) => [m[1], m[2].trim()]));
}
export function parseState(text, graph = []) {
  const values = fields(text);
  let phase = 'initialization';
  const stages = [];
  for (const line of text.split('\n')) {
    const heading = line.match(/^### (INITIALIZATION|IDEATION|INCEPTION|CONSTRUCTION|OPERATION) PHASE/);
    if (heading) phase = heading[1].toLowerCase();
    const row = line.match(/^- \[([ x?RS-])\]\s+([a-z0-9-]+)\s+[—–-]\s+(EXECUTE|SKIP)/);
    if (!row) continue;
    const definition = graph.find((node) => node.slug === row[2]);
    stages.push({ slug: row[2], name: names[row[2]] ?? definition?.name ?? row[2], englishName: definition?.name ?? row[2], phase: definition?.phase ?? phase, status: row[3] === 'SKIP' ? 'skipped' : markers[row[1]] });
  }
  if (!values['Status'] || !values['Current Stage'] || !stages.length) throw new Error('INVALID_STATE');
  return { values, stages };
}
export function parseAudit(text, shard = '') {
  return text.split(/^## /m).slice(1).map((block, index) => {
    const data = fields(block);
    if (!data.Event || !data.Timestamp || !Number.isFinite(Date.parse(data.Timestamp))) return null;
    return { id: createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 20), type: data.Event, at: data.Timestamp, data, shard, index };
  }).filter(Boolean);
}
export function mergeEvents(events) {
  const unique = [...new Map(events.map((event) => [event.id, event])).values()];
  return unique.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.shard.localeCompare(b.shard) || a.index - b.index);
}
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
export function safeSegment(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(value) && value !== '.' && value !== '..'; }
export async function readInside(root, path, max = 2_000_000) {
  if (isAbsolute(path)) throw new Error('INVALID_PATH');
  const base = await realpath(root);
  const target = await realpath(resolve(base, path));
  if (!within(base, target)) throw new Error('INVALID_PATH');
  const info = await stat(target);
  if (!info.isFile() || info.size > max) throw new Error('FILE_LIMIT');
  return readFile(target, 'utf8');
}
async function optional(root, path, max) {
  try { return await readInside(root, path, max); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directories(root) {
  return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && safeSegment(entry.name) && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
}
export async function catalog(projectRoot) {
  const project = await realpath(projectRoot);
  const spacesPath = resolve(project, 'aidlc/spaces');
  const spaces = await directories(spacesPath);
  const activeSpace = (await optional(project, 'aidlc/active-space'))?.trim();
  const options = [];
  for (const space of spaces.slice(0, 50)) {
    const registry = JSON.parse((await optional(project, `aidlc/spaces/${space}/intents/intents.json`)) ?? '[]');
    if (!Array.isArray(registry)) throw new Error('INVALID_REGISTRY');
    for (const row of registry.slice(0, 200)) if (safeSegment(row.dirName)) options.push({ space, intent: row.dirName, label: typeof row.slug === 'string' ? row.slug : row.dirName, status: row.status ?? 'unknown' });
  }
  const defaultSpace = spaces.includes(activeSpace) ? activeSpace : spaces[0];
  const activeIntent = defaultSpace ? (await optional(project, `aidlc/spaces/${defaultSpace}/intents/active-intent`))?.trim() : null;
  const selected = options.find((row) => row.space === defaultSpace && row.intent === activeIntent) ?? options.find((row) => row.status === 'active') ?? options[0];
  return { project: basename(project), options, selected: selected ? { space: selected.space, intent: selected.intent } : null };
}
async function selectRecord(project, selection) {
  const items = await catalog(project);
  const chosen = selection?.intent ? selection : items.selected;
  if (!chosen || !items.options.some((row) => row.space === chosen.space && row.intent === chosen.intent)) throw new Error('UNKNOWN_INTENT');
  const base = await realpath(project);
  const record = await realpath(resolve(base, 'aidlc/spaces', chosen.space, 'intents', chosen.intent));
  if (!within(base, record)) throw new Error('INVALID_PATH');
  return { record, chosen, project: items.project };
}
async function graphFor(project) {
  for (const harness of ['.codex', '.claude', '.kiro', '.aidlc']) {
    const text = await optional(project, `${harness}/tools/data/stage-graph.json`);
    if (!text) continue;
    const data = JSON.parse(text);
    const graph = Array.isArray(data) ? data : data.stages;
    if (!Array.isArray(graph)) throw new Error('INVALID_GRAPH');
    const version = (await optional(project, `${harness}/tools/aidlc-version.ts`))?.match(/AIDLC_VERSION\s*=\s*"([^"]+)"/)?.[1] ?? '不明';
    const caps = {};
    let files = [];
    try { files = await readdir(resolve(project, harness, 'scopes')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const file of files.filter((file) => file.endsWith('.md'))) {
      const body = await readInside(project, `${harness}/scopes/${file}`);
      const front = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const scalar = (key) => front.match(new RegExp(`^${key}:\\s*["']?([^"'\\s#]+)`, 'm'))?.[1];
      const name = scalar('name');
      if (name) caps[name] = scalar('review_cap');
    }
    return { graph, version, caps };
  }
  return { graph: [], version: '不明', caps: {} };
}
async function artifactList(record, stage, phase) {
  const found = [];
  async function walk(folder, depth) {
    let entries;
    try {
      const target = await realpath(resolve(record, folder));
      if (!within(record, target)) throw new Error('INVALID_PATH');
      entries = await readdir(target, { withFileTypes: true });
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || ['memory.md', 'learnings-selections.json'].includes(entry.name) || entry.isSymbolicLink()) continue;
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory() && depth < 4) await walk(path, depth + 1);
      if (!entry.isFile() || !['.md', '.json', '.txt'].includes(extname(entry.name)) || !folder.split('/').includes(stage)) continue;
      if (found.length >= 200) throw new Error('ARTIFACT_LIMIT');
      const info = await stat(resolve(record, path));
      const segments = folder.split('/');
      const stageIndex = segments.indexOf(stage);
      found.push({ path, name: entry.name, unit: stageIndex > 1 ? segments[stageIndex - 1] : null, updatedAt: info.mtime.toISOString() });
    }
  }
  if (safeSegment(phase) && safeSegment(stage)) await walk(phase, 0);
  return found;
}

export function projectState(parsed, graph, events, now = Date.now(), caps = {}) {
  const { values, stages } = parsed;
  const slug = values.Status === 'Completed' && values['Current Stage'] === 'none'
    ? values['Last Completed Stage'] || stages.findLast((node) => node.status === 'completed')?.slug || 'none'
    : values['Current Stage'];
  const definition = graph.find((node) => node.slug === slug) ?? {};
  const stage = stages.find((node) => node.slug === slug) ?? { slug, name: names[slug] ?? slug, phase: (values['Lifecycle Phase'] ?? '').toLowerCase(), status: 'pending' };
  const ranks = ['none', 'advisory', 'adversarial'];
  const declared = Math.max(0, ranks.indexOf(definition.review_class));
  const reviewClass = ranks[Math.min(declared, ...[caps[values.Scope], values['Review Override']].filter((value) => ranks.includes(value)).map((value) => ranks.indexOf(value)))];
  // Single-stage invocations and unrelated sessions must not advance the tracked workflow.
  const mainEvents = events.filter((event) => !event.data.Workflow?.startsWith('single-stage:'));
  let start = -1;
  for (let i = 0; i < mainEvents.length; i++) if (['WORKFLOW_STARTED', 'STAGE_JUMPED'].includes(mainEvents[i].type) || (mainEvents[i].type === 'STAGE_STARTED' && mainEvents[i].data.Stage === slug)) start = i;
  const attempt = mainEvents.slice(start + 1).filter((event) => event.data.Stage === slug ||
    (['ARTIFACT_CREATED', 'ARTIFACT_UPDATED'].includes(event.type) && (event.data.File ?? '').split('/').includes(slug)));
  const unitEvent = [...attempt].reverse().find((event) => ['UNIT_STARTED', 'UNIT_RESUMED', 'UNIT_COMPLETED', 'UNIT_PAUSED', 'STAGE_AWAITING_APPROVAL'].includes(event.type) && event.data.Unit);
  const unit = values['Current Unit'] || (unitEvent?.type === 'UNIT_COMPLETED' ? null : unitEvent?.data.Unit) || null;
  const unitPaused = unitEvent?.type === 'UNIT_PAUSED' && unitEvent.data.Unit === unit;
  // Unattributed Unit receipts are not evidence for the entire stage.
  const scoped = attempt.filter((event) => !event.data.Unit || event.data.Unit === unit);
  const boundaryIndex = scoped.findLastIndex((event) => ['GATE_REJECTED', 'STAGE_REVISING'].includes(event.type));
  const current = scoped.slice(boundaryIndex + 1);
  const orderingScope = mainEvents.slice(Math.max(0, start)).filter((event) => event.data.Stage === slug || ['WORKFLOW_STARTED', 'STAGE_JUMPED'].includes(event.type));
  const shardsByTime = new Map();
  for (const event of orderingScope) { const shards = shardsByTime.get(event.at) ?? new Set(); shards.add(event.shard); shardsByTime.set(event.at, shards); }
  const ambiguous = [...shardsByTime.values()].some((shards) => shards.size > 1);
  let step = 'unknown';
  let waiting = null;
  let review = null;
  if (!ambiguous) {
    for (const event of current) {
      if (event.type === 'DECISION_RECORDED') { step = 'questions'; waiting = /summary[- ]confirmation/i.test(event.data.Checkpoint ?? '') ? 'summary' : 'questions'; }
      if (event.type === 'QUESTION_ANSWERED' && waiting !== 'summary') { waiting = null; step = 'questions'; }
      if (event.type === 'SUMMARY_CONFIRMATION_RECORDED') {
        waiting = /^Looks correct$/i.test(event.data.Details ?? '') ? null : /request changes/i.test(event.data.Details ?? '') ? 'questions' : 'summary';
        step = waiting ? 'questions' : 'artifact';
      }
      if (['ARTIFACT_CREATED', 'ARTIFACT_UPDATED'].includes(event.type)) {
        const file = event.data.File ?? '';
        const diary = /\/(memory\.md|learnings-selections\.json)$/.test(file);
        const otherUnit = unit && file.includes(`/construction/`) && !file.includes(`/construction/${slug}/`) && !file.includes(`/construction/${unit}/${slug}/`);
        if (!diary && !otherUnit) { if (!waiting) step = 'artifact'; review = null; }
      }
      if (event.type === 'REVIEW_REQUESTED') { waiting = null; step = 'review'; review = null; }
      if (event.type === 'REVIEW_COMPLETED') { step = 'learning'; review = { verdict: event.data.Verdict ?? event.data.Result ?? '記録あり', at: event.at, unit: event.data.Unit ?? null }; }
      if (event.type === 'RULE_LEARNED') step = 'learning';
    }
  }
  if (stage.status === 'awaiting') { waiting = 'gate'; step = 'gate'; }
  if (stage.status === 'revising') { waiting = null; if (step !== 'review') step = 'artifact'; }
  if (values.Status === 'Completed' || stage.status === 'completed') { waiting = null; step = 'gate'; }
  const lastEvent = mainEvents.at(-1);
  const sessionEvent = [...mainEvents].reverse().find((event) => ['SESSION_STARTED', 'SESSION_RESUMED', 'SESSION_ENDED'].includes(event.type));
  const age = lastEvent ? now - Date.parse(lastEvent.at) : Infinity;
  const activity = sessionEvent?.type === 'SESSION_ENDED' && Date.parse(sessionEvent.at) >= (lastEvent ? Date.parse(lastEvent.at) : 0) ? 'ended' : age >= 0 && age < 120_000 ? 'recent' : 'unknown';
  return {
    stage: { ...stage, lead: values['Active Agent'] || definition.lead_agent || 'orchestrator', supports: definition.support_agents ?? [], reviewer: reviewClass === 'none' ? null : definition.reviewer ?? null, reviewClass, mode: definition.mode ?? 'unknown', perUnit: definition.for_each === 'unit-of-work', unit, unitPaused },
    step, waiting, review, activity, lastEventAt: lastEvent?.at ?? null, stateUpdatedAt: values['Last Updated'] ?? null,
    workflowStatus: values.Status, parked: /^(true|yes|on)$/i.test(values.Parked ?? '') || Number.isFinite(Date.parse(values.Parked ?? '')), stages,
    events: [...mainEvents].reverse().filter((event) => labels[event.type]).slice(0, 30).map((event) => ({ id: event.id, type: event.type, at: event.at, label: labels[event.type], stage: event.data.Stage ?? null, unit: event.data.Unit ?? null })),
    warnings: ambiguous ? ['同じ時刻に複数の記録があり、工程内の順序を確定できません。'] : [],
  };
}

export async function readSnapshot(project, selection) {
  const { record, chosen, project: projectName } = await selectRecord(project, selection);
  const { graph, version, caps } = await graphFor(project);
  // State is authoritative for the cursor; audit augments it, never routes a stage.
  const stateText = await readInside(record, 'aidlc-state.md');
  const parsed = parseState(stateText, graph);
  let auditFiles = [];
  try { auditFiles = (await readdir(resolve(record, 'audit'), { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (auditFiles.length > 100) throw new Error('AUDIT_LIMIT');
  const batches = await Promise.all(auditFiles.map(async (file) => parseAudit(await readInside(record, `audit/${file}`, 8_000_000), file)));
  const model = projectState(parsed, graph, mergeEvents(batches.flat()), Date.now(), caps);
  const artifacts = await artifactList(record, model.stage.slug, model.stage.phase);
  if ((await readInside(record, 'aidlc-state.md')) !== stateText) throw new Error('STATE_CHANGING');
  return { ...model, source: 'live', project: projectName, version, space: chosen.space, intent: chosen.intent, scope: parsed.values.Scope ?? '', artifacts, fetchedAt: new Date().toISOString() };
}
export async function readArtifact(project, selection, path) {
  const { record } = await selectRecord(project, selection);
  const snapshot = await readSnapshot(project, selection);
  if (!snapshot.artifacts.some((artifact) => artifact.path === path)) throw new Error('INVALID_ARTIFACT');
  return { name: basename(path), text: await readInside(record, path, 512_000) };
}
