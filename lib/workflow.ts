export type WorkflowState = 'pending' | 'active' | 'awaiting' | 'revising' | 'completed' | 'skipped';
export type Step = 'questions' | 'artifact' | 'review' | 'learning' | 'gate' | 'unknown';
export type Snapshot = {
  source: 'live' | 'demo';
  project: string;
  version: string;
  space: string;
  intent: string;
  scope: string;
  workflowStatus: string;
  stage: { slug: string; name: string; englishName?: string; phase: string; status: WorkflowState; lead: string; supports: string[]; mode: string; reviewer: string | null; reviewClass?: string; unitPaused?: boolean; perUnit: boolean; unit: string | null };
  step: Step;
  waiting: 'gate' | 'summary' | 'questions' | null;
  parked: boolean;
  activity: 'unknown' | 'recent' | 'ended';
  lastEventAt: string | null;
  stateUpdatedAt: string | null;
  fetchedAt: string;
  stages: { slug: string; name: string; englishName?: string; phase: string; status: WorkflowState }[];
  artifacts: { path: string; name: string; unit: string | null; updatedAt: string }[];
  events: { id: string; type: string; label: string; stage: string | null; unit: string | null; at: string }[];
  review: { verdict: string; at: string; unit: string | null } | null;
  warnings: string[];
};

export const phaseNames: Record<string, string> = { initialization: '準備', ideation: '構想', inception: '計画', construction: '構築', operation: '運用' };
export const stateNames: Record<WorkflowState, string> = { pending: '未着手', active: '進行中', awaiting: '承認待ち', revising: '修正中', completed: '完了', skipped: '対象外・スキップ' };
export const agentNames: Record<string, string> = {
  orchestrator: '進行役', 'aidlc-architect-agent': '設計担当', 'aidlc-developer-agent': '開発担当',
  'aidlc-product-agent': '企画担当', 'aidlc-design-agent': '画面設計担当', 'aidlc-delivery-agent': '計画担当',
  'aidlc-quality-agent': '品質担当', 'aidlc-architecture-reviewer-agent': '設計レビュー担当',
  'aidlc-product-lead-agent': '企画レビュー担当', 'aidlc-devsecops-agent': 'セキュリティ担当',
  'aidlc-aws-platform-agent': '基盤担当', 'aidlc-compliance-agent': '規約・法令担当',
  'aidlc-operations-agent': '運用担当', 'aidlc-pipeline-deploy-agent': '配備担当', 'aidlc-composer-agent': '工程構成担当',
};

export function describe(snapshot: Snapshot) {
  if (snapshot.parked) return { title: '中断して保留しています', speech: 'ワークフローは保留中です。', action: 'AI-DLCの会話で再開', reason: '工程を進めずに保留されています。', tone: 'quiet' };
  if (snapshot.stage.unitPaused) return { title: '作業単位を一時停止しています', speech: 'このUnitは一時停止中です。', action: 'AI-DLCの会話で作業単位を再開', reason: '一時停止したUnitは、明示的に再開するまで進みません。', tone: 'quiet' };
  if (snapshot.workflowStatus === 'Completed') return { title: 'ワークフロー完了', speech: 'ワークフローが完了しました。', action: '成果物と記録を確認できます', reason: '対象の工程が完了した記録を表示しています。', tone: 'success' };
  if (snapshot.stage.status === 'pending') return { title: 'この工程は未着手', speech: 'この工程は未着手です。', action: '工程の開始を待っています', reason: '開始が記録されると表示を更新します。', tone: 'quiet' };
  if (snapshot.stage.status === 'skipped') return { title: 'この工程はスキップ', speech: 'この工程は対象外です。', action: '全体の工程を確認できます', reason: 'スキップを、成果物の完成とは区別して表示します。', tone: 'quiet' };
  if (snapshot.waiting === 'gate') return { title: 'あなたの承認待ち', speech: '成果物の承認待ちです。', action: '成果物を確認し、承認または修正依頼', reason: '回答先は作業中のAI-DLCの会話です。', tone: 'attention' };
  if (snapshot.waiting === 'summary') return { title: '回答内容の確認待ち', speech: '回答のまとめの確認待ちです。', action: '回答のまとめに、認識違いがないか確認', reason: '工程の最終承認とは別の確認です。AI-DLCの会話で回答してください。', tone: 'attention' };
  if (snapshot.waiting === 'questions') return { title: '質問への回答待ち', speech: '質問への回答待ちです。', action: 'AI-DLCの質問に回答', reason: '質問の内容は、成果物欄からも確認できます。', tone: 'attention' };
  if (snapshot.stage.status === 'revising') return { title: '修正の工程', speech: '修正依頼が記録されています。', action: '修正版と再確認の案内を待っています', reason: '過去のレビュー結果と修正版の確認は区別します。', tone: 'quiet' };
  if (snapshot.step === 'questions') return { title: '回答を記録済み', speech: '質問への回答が記録されています。', action: '回答を確認', reason: '', tone: 'quiet' };
  if (snapshot.step === 'review') return { title: 'レビューの結果待ち', speech: 'レビュー依頼済みです。', action: 'レビュー結果を待っています', reason: 'レビューが完了すると記録を更新します。', tone: 'quiet' };
  if (snapshot.review?.verdict === 'NOT-READY') return { title: 'レビューで修正が必要', speech: 'レビュー結果：NOT-READY', action: 'レビュー結果と修正版を確認', reason: '工程の承認に進める状態かは、AI-DLC側で判断します。', tone: 'attention' };
  if (snapshot.step === 'learning') return { title: 'レビュー後の整理', speech: '工程内の記録：学びの整理', action: '次の確認事項を待っています', reason: 'レビュー完了は、人による工程の承認とは別です。', tone: 'quiet' };
  if (snapshot.step === 'artifact') return { title: '成果物の作成段階', speech: '工程内の記録：成果物の作成', action: '成果物の更新を見守っています', reason: '保存の記録は、工程の完了とは区別しています。', tone: 'quiet' };
  if (snapshot.stage.status === 'completed') return { title: 'この工程は完了', speech: 'この工程は完了しています。', action: '成果物と直近の動きを確認', reason: '次の工程はAI-DLCが決めた記録に従います。', tone: 'success' };
  return { title: '記録上は進行中', speech: '工程内の進捗は、記録から判定できません。', action: '直近の記録を見守っています', reason: '記録の更新を見つけると、自動で表示が変わります。', tone: 'quiet' };
}
