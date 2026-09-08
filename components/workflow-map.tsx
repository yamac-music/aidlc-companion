import { agentNames, phaseNames, stateNames, type Snapshot } from '../lib/workflow';

type Props = { snapshot: Snapshot };
export function LocationSummary({ snapshot }: Props) {
  const stages = snapshot.stages.filter((stage) => stage.phase === snapshot.stage.phase && stage.status !== 'skipped');
  const index = stages.findIndex((stage) => stage.slug === snapshot.stage.slug);
  return <div className="location-summary"><span>{snapshot.workflowStatus === 'Completed' ? '最終工程' : '現在地'} · {phaseNames[snapshot.stage.phase] ?? snapshot.stage.phase}</span>{index >= 0 && <span>対象{stages.length}工程の{index + 1}番目</span>}</div>;
}

export function WorkflowMap({ snapshot }: Props) {
  const phases = [...new Set(snapshot.stages.map((stage) => stage.phase))];
  return <div className="workflow-map">{phases.map((phase) => {
    const group = snapshot.stages.filter((stage) => stage.phase === phase);
    const included = group.filter((stage) => stage.status !== 'skipped');
    const completed = included.filter((stage) => stage.status === 'completed').length;
    return <section key={phase} className="map-phase" aria-label={phaseNames[phase] ?? phase}>
      <h3><span>{phaseNames[phase] ?? phase}<small lang="en">{phase.charAt(0).toUpperCase() + phase.slice(1)}</small></span><span>{included.length ? `${completed} / ${included.length} 完了` : '対象外'}</span></h3>
      <ol>{group.map((stage) => {
        const current = stage.slug === snapshot.stage.slug;
        const lead = current ? snapshot.stage.lead : stage.lead;
        const status = current && (snapshot.parked || snapshot.stage.unitPaused) ? '保留' : stateNames[stage.status];
        return <li key={stage.slug} className={`${current ? 'map-current' : ''} ${stage.status === 'skipped' ? 'map-skipped' : ''}`} aria-current={current && snapshot.workflowStatus !== 'Completed' ? 'step' : undefined}>
          <span className="map-marker" aria-hidden="true">{current ? '●' : stage.status === 'completed' ? '✓' : stage.status === 'skipped' ? '−' : '○'}</span>
          <div className="map-stage"><div className="map-stage-title"><strong>{stage.name}</strong><span>{current && snapshot.workflowStatus !== 'Completed' ? `現在 · ${status}` : status}</span></div><span className="original-name" lang="en">{stage.englishName ?? stage.slug}</span><span className="map-owner">{stage.status === 'skipped' ? '実行なし' : `担当：${lead ? agentNames[lead] ?? lead : '定義なし'}`}</span></div>
        </li>;
      })}</ol>
    </section>;
  })}</div>;
}
