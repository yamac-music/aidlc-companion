import type { Snapshot } from './workflow';
export const demoScenes = { summary: '回答内容の確認', working: '成果物の作成', review: 'レビュー', gate: '工程の承認待ち', revise: '差し戻し後', done: '完了' };
export type DemoScene = keyof typeof demoScenes;
export function demoSnapshot(scene: DemoScene): Snapshot {
  const at = '2026-09-06T10:00:00Z';
  const stages: Snapshot['stages'] = [
    { slug: 'workspace-detection', lead: 'orchestrator', englishName: 'Workspace Detection', name: '既存環境の確認', phase: 'initialization', status: 'completed' },
    { slug: 'scope-definition', lead: 'aidlc-product-agent', englishName: 'Scope Definition', name: '範囲の決定', phase: 'ideation', status: 'completed' },
    { slug: 'delivery-planning', lead: 'aidlc-delivery-agent', englishName: 'Delivery Planning', name: '実行計画', phase: 'inception', status: 'completed' },
    { slug: 'functional-design', lead: 'aidlc-architect-agent', englishName: 'Functional Design', name: '機能設計', phase: 'construction', status: scene === 'gate' ? 'awaiting' : scene === 'revise' ? 'revising' : scene === 'done' ? 'completed' : 'active' },
    { slug: 'nfr-requirements', lead: 'aidlc-architect-agent', englishName: 'NFR Requirements', name: '品質条件の整理', phase: 'construction', status: scene === 'done' ? 'skipped' : 'pending' },
    { slug: 'deployment-execution', lead: 'aidlc-pipeline-deploy-agent', englishName: 'Deployment Execution', name: '配備', phase: 'operation', status: 'skipped' },
  ];
  return {
    source: 'demo', project: 'サンプルプロジェクト', version: '2.x', space: 'default', intent: 'サンプルUI', scope: 'mvp',
    stage: { ...stages[3], lead: 'aidlc-architect-agent', supports: ['aidlc-developer-agent'], reviewer: 'aidlc-architecture-reviewer-agent', mode: 'inline', perUnit: true, unit: 'data-client' },
    workflowStatus: scene === 'done' ? 'Completed' : 'Running', stages,
    step: scene === 'summary' ? 'questions' : scene === 'review' ? 'review' : ['gate', 'done'].includes(scene) ? 'gate' : 'artifact',
    waiting: scene === 'gate' ? 'gate' : scene === 'summary' ? 'summary' : null, parked: false, activity: 'recent',
    lastEventAt: at, stateUpdatedAt: at, fetchedAt: at,
    artifacts: scene === 'summary' ? [{ name: 'functional-design-questions.md', path: 'demo/questions.md', unit: 'data-client', updatedAt: at }] : [{ name: 'functional-spec.md', path: 'demo/spec.md', unit: 'data-client', updatedAt: at }],
    events: [{ id: scene, type: scene === 'gate' ? 'STAGE_AWAITING_APPROVAL' : scene === 'review' ? 'REVIEW_REQUESTED' : scene === 'done' ? 'WORKFLOW_COMPLETED' : 'STAGE_STARTED', label: scene === 'gate' ? '工程の承認を依頼' : scene === 'review' ? 'レビューを依頼' : scene === 'done' ? 'ワークフロー完了' : scene === 'revise' ? '修正依頼を記録' : '工程を開始', stage: 'functional-design', unit: 'data-client', at }],
    review: ['gate', 'done'].includes(scene) ? { verdict: 'READY', at, unit: 'data-client' } : null, warnings: [],
  };
}
export function demoArtifact(path: string) {
  return { name: path.endsWith('questions.md') ? 'functional-design-questions.md' : 'functional-spec.md', text: path.endsWith('questions.md') ? '# 回答内容の確認〈デモ〉\n\n- 通信に失敗したときは、手動で再試行する。\n- データがない場合は、空の状態を表示する。\n\nこの内容で認識が合っているか、作業中のAI-DLCで確認します。\n\n※画面を試すための架空の内容です。' : '# 機能仕様〈デモ〉\n\n## データ取得\n\n一覧データを取得し、詳細画面へ進む。\n\n## エラー時の動作\n\n通信に失敗した場合は状態を案内し、ユーザーの操作で再試行する。\n\n## レビュー\n\nこれは画面を試すための架空の成果物です。実プロジェクトのレビュー結果ではありません。' };
}
