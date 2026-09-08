'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { LocationSummary, WorkflowMap } from '@/components/workflow-map';
import { ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, FileText, Layers3, Maximize2, RefreshCw, ShieldCheck, Sparkles, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { agentNames, describe, phaseNames, stateNames, type Snapshot } from '@/lib/workflow';
import { demoArtifact, demoScenes, demoSnapshot, type DemoScene } from '@/lib/demo';

type Theme = 'light' | 'dark' | 'system';
const themeKey = 'aidlc-sidecar-theme';
function validTheme(value: string | null): Theme { return value === 'light' || value === 'dark' ? value : 'system'; }
function applyTheme(value: Theme) { document.documentElement.dataset.theme = value; }

let volatileTheme: Theme = 'system';
function readTheme(): Theme { try { return validTheme(localStorage.getItem(themeKey)); } catch { return volatileTheme; } }
function subscribeTheme(notify: () => void) {
  const sync = (event: StorageEvent) => { if (event.key === themeKey || event.key === null) notify(); };
  window.addEventListener('storage', sync);
  window.addEventListener('aidlc-theme-change', notify);
  return () => { window.removeEventListener('storage', sync); window.removeEventListener('aidlc-theme-change', notify); };
}

type Selection = { space: string; intent: string };
type Catalog = { project: string; options: (Selection & { label: string; status: string })[]; selected: Selection | null };
const steps = [{ id: 'questions', name: '質問' }, { id: 'artifact', name: '作成' }, { id: 'review', name: 'レビュー' }, { id: 'learning', name: '学び' }, { id: 'gate', name: '承認' }];
function englishName(slug: string) { return slug.split('-').map((word) => ['nfr', 'ui', 'ux', 'api', 'aws'].includes(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }
function time(value: string | null) { return value ? new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '記録なし'; }
function params(selection: Selection | null) { return selection ? new URLSearchParams(selection).toString() : ''; }
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : '読み取りに失敗しました。');
  return data as T;
}

export default function Home() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as Theme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  function changeTheme(value: Theme) {
    volatileTheme = value;
    try { localStorage.setItem(themeKey, value); } catch { /* Keep the preference for this page when storage is unavailable. */ }
    applyTheme(value);
    window.dispatchEvent(new Event('aidlc-theme-change'));
  }
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [scene, setScene] = useState<DemoScene>('gate');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [live, setLive] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [reading, setReading] = useState(false);
  const [documentView, setDocumentView] = useState<{ name: string; text: string } | null>(null);
  const [documentError, setDocumentError] = useState('');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [motion, setMotion] = useState(true);
  const artifactRequest = useRef<AbortController | null>(null);
  useEffect(() => () => artifactRequest.current?.abort(), []);

  useEffect(() => {
    if (mode !== 'live') return;
    const lifecycle = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    async function load() {
      if (busy || lifecycle.signal.aborted) return;
      busy = true;
      setReading(true);
      const request = new AbortController();
      const abort = () => request.abort();
      lifecycle.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 8000);
      try {
        const [list, snapshot] = await Promise.all([
          getJson<Catalog>('/api/aidlc/catalog', request.signal),
          getJson<Snapshot>(`/api/aidlc/snapshot?${params(selection)}`, request.signal),
        ]);
        if (!lifecycle.signal.aborted) { setCatalog(list); setLive(snapshot); setError(''); }
      } catch (caught) {
        if (!lifecycle.signal.aborted) setError(request.signal.aborted ? '記録の取得に時間がかかっています。再試行します。' : caught instanceof Error ? caught.message : '接続を確認してください。');
      } finally {
        clearTimeout(timeout);
        lifecycle.signal.removeEventListener('abort', abort);
        busy = false;
        if (!lifecycle.signal.aborted) { setReading(false); timer = setTimeout(load, document.hidden ? 10000 : 3000); }
      }
    }
    void load();
    return () => { lifecycle.abort(); clearTimeout(timer); };
  }, [mode, selection, refresh]);

  const snapshot = mode === 'demo' ? demoSnapshot(scene) : live;
  const presentation = snapshot ? describe(snapshot) : null;
  const role = snapshot ? (snapshot.step === 'review' ? snapshot.stage.reviewer : snapshot.stage.lead) ?? snapshot.stage.lead : 'orchestrator';
  const visibleSteps = steps.filter((step) => (step.id !== 'review' || snapshot?.stage.reviewer) && (step.id !== 'gate' || snapshot?.stage.phase !== 'initialization'));
  const activeStep = visibleSteps.findIndex((step) => step.id === snapshot?.step);


  async function openArtifact(path: string) {
    if (!snapshot) return;
    artifactRequest.current?.abort();
    const request = new AbortController();
    artifactRequest.current = request;
    const timeout = setTimeout(() => request.abort(), 8000);
    setDocumentError('');
    setDocumentView({ name: '成果物を読み込み中', text: '' });
    try {
      const result = mode === 'demo' ? demoArtifact(path) : await getJson<{ name: string; text: string }>(`/api/aidlc/artifact?${params({ space: snapshot.space, intent: snapshot.intent })}&path=${encodeURIComponent(path)}`, request.signal);
      if (!request.signal.aborted) setDocumentView(result);
    } catch (caught) { if (artifactRequest.current === request) setDocumentError(request.signal.aborted ? '読み込みを中止しました。もう一度開いてください。' : caught instanceof Error ? caught.message : '読み取りに失敗しました。'); }
    finally { clearTimeout(timeout); }
  }
  function closeArtifact() { artifactRequest.current?.abort(); artifactRequest.current = null; setDocumentView(null); setDocumentError(''); }
  function changeMode(next: 'live' | 'demo') { setMode(next); closeArtifact(); }
  function openWindow() {
    const popup = window.open(window.location.href, 'aidlc-companion', 'popup,width=440,height=820,resizable=yes,scrollbars=yes');
    setPopupBlocked(!popup);
    if (popup) popup.opener = null;
  }

  return (
    <main className="sidecar" data-motion={motion ? 'on' : 'off'}>
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><Sparkles size={17} aria-hidden="true" /></span><span>AI-DLC のとなり</span></div>
        <div className="theme-picker"><NativeSelect aria-label="配色" value={theme} onChange={(event) => changeTheme(validTheme(event.target.value))}><NativeSelectOption value="light">ライト</NativeSelectOption><NativeSelectOption value="dark">ダーク</NativeSelectOption><NativeSelectOption value="system">システムに合わせる</NativeSelectOption></NativeSelect></div>
        <Button variant="ghost" size="icon" onClick={openWindow} aria-label="小さな別ウィンドウで開く" title="小窓で開く"><Maximize2 /></Button>
        <Button variant="ghost" size="icon" aria-label="記録を再取得" disabled={reading || mode === 'demo'} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} className={reading ? 'refreshing' : ''} /></Button>
      </header>
      {(mode === 'demo' || !live) && <div className="toolbar">
        {(mode === 'demo' || !live) && <fieldset className="mode-switch" aria-label="表示するデータ">
          <Button variant={mode === 'live' ? 'secondary' : 'ghost'} aria-pressed={mode === 'live'} onClick={() => changeMode('live')}>実際の記録</Button>
          <Button variant={mode === 'demo' ? 'secondary' : 'ghost'} aria-pressed={mode === 'demo'} onClick={() => changeMode('demo')}>デモ</Button>
        </fieldset>}

      </div>}
      {mode === 'demo' ? <div className="source-picker"><label htmlFor="scene">場面を試す</label><NativeSelect id="scene" value={scene} onChange={(event) => setScene(event.target.value as DemoScene)}>{Object.entries(demoScenes).map(([id, label]) => <NativeSelectOption key={id} value={id}>{label}</NativeSelectOption>)}</NativeSelect></div> : catalog && catalog.options.length > 1 ? <div className="source-picker"><label htmlFor="intent">作業</label><NativeSelect id="intent" value={selection ? `${selection.space}/${selection.intent}` : catalog.selected ? `${catalog.selected.space}/${catalog.selected.intent}` : ''} onChange={(event) => { const [space, intent] = event.target.value.split('/'); setLive(null); setSelection({ space, intent }); closeArtifact(); }}>{catalog.options.map((item) => <NativeSelectOption key={`${item.space}/${item.intent}`} value={`${item.space}/${item.intent}`}>{item.label}</NativeSelectOption>)}</NativeSelect></div> : null}
      {popupBlocked && <output className="notice">小窓を開けませんでした。ブラウザでポップアップを許可するか、このウィンドウを細くしてください。</output>}
      {error && mode === 'live' && <output className="connection-error"><WifiOff size={16} /><div>{error}{live && <p>前回取得した記録を表示しています。</p>}</div></output>}
      {!snapshot ? <section className="empty-state"><CircleHelp size={30} /><h1>{error ? '接続を確認してください' : 'AI-DLCの記録を読み込んでいます'}</h1><p>{error ? 'デモでは、承認待ちやレビュー中の見え方を試せます。' : '工程と直近の動きを確認しています。'}</p><Button variant="outline" onClick={() => changeMode('demo')}>デモを見る</Button></section> : <>
        <section className="current-work" aria-label="現在の工程">

          <nav className="phase-track" aria-label="全体の現在地">{Object.entries(phaseNames).map(([id, name]) => { const group = snapshot.stages.filter((stage) => stage.phase === id); const skipped = group.every((stage) => stage.status === 'skipped'); const complete = group.length > 0 && group.every((stage) => ['completed', 'skipped'].includes(stage.status)); const current = snapshot.stage.phase === id && snapshot.workflowStatus !== 'Completed'; return <div key={id} className={current ? 'phase current' : skipped ? 'phase skipped' : complete ? 'phase complete' : 'phase'} aria-current={current ? 'step' : undefined}><span>{name}<small lang="en" className="phase-english">{englishName(id)}</small></span><span aria-label={current ? '現在' : skipped ? '対象外' : complete ? '完了' : 'これから'}>{current ? '●' : skipped ? '−' : complete ? '✓' : '·'}</span></div>; })}</nav>
          <LocationSummary snapshot={snapshot} />
          <div className="stage-heading"><div><h1>{snapshot.stage.name}</h1><p className="original-name" lang="en">{(snapshot.stage.englishName ?? snapshot.stage.slug)}</p></div><span className={`status-pill ${presentation?.tone}`}>{snapshot.parked || snapshot.stage.unitPaused ? '保留' : stateNames[snapshot.stage.status]}</span></div>
          {snapshot.stage.perUnit && snapshot.stage.unit && <p className="unit-label"><Layers3 size={14} aria-hidden="true" />{snapshot.stage.unit ? <span>対象：{snapshot.stage.unit}</span> : <span>Unit：未指定</span>}</p>}
        </section>
        <section className={`companion-room ${presentation?.tone}`} aria-label="担当と状況">
          <div className="companion-art" key={`${mode}:${snapshot.stage.slug}:${snapshot.stage.status}:${snapshot.step}`}><Image unoptimized src="/assets/companion.png" alt="ノートを持った工房の相棒" width="96" height="116" /><span className="role-pin" aria-hidden="true">{snapshot.step === 'review' ? <ShieldCheck size={16} /> : snapshot.waiting ? <CircleHelp size={16} /> : <FileText size={16} />}</span></div>
          <div className="companion-message" aria-live="polite"><div className="role-name">{agentNames[role] ?? role}<span className="original-name" lang="en">{englishName(role.replace(/^aidlc-/, '').replace(/-agent$/, ''))}</span></div><p>{presentation?.speech}</p></div>
        </section>

        {snapshot.step !== 'unknown' && <section className="ritual" aria-label="この工程内の進み具合">
          <div className="section-caption">この工程の中では<span>{presentation?.title}</span></div>
          <ol className="step-track">{visibleSteps.map((step, index) => <li key={step.id} className={activeStep === index ? 'current' : ''} aria-current={activeStep === index ? 'step' : undefined}><span className="step-dot">{activeStep === index ? <span /> : <span className="small-dot" />}</span><span>{step.name}</span></li>)}</ol>
        </section>}
        {(snapshot.waiting || snapshot.parked || snapshot.stage.unitPaused) && <section className={`next-action ${snapshot.waiting ? 'needs-you' : ''}`} aria-live="polite"><div className="action-icon">{snapshot.waiting ? <ArrowUpRight size={18} /> : snapshot.workflowStatus === 'Completed' ? <Check size={18} /> : <Clock3 size={18} />}</div><div><span className="eyebrow">{snapshot.waiting ? 'あなたの出番' : 'いまの状況'}</span><h2>{presentation?.action}</h2><p>回答・再開はAI-DLCの会話で</p></div></section>}
        {snapshot.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
        <Accordion className="details" multiple>
          <AccordionItem value="artifacts"><AccordionTrigger><span className="detail-label"><FileText size={16} />成果物とレビュー <span className="count">{snapshot.artifacts.length}</span></span></AccordionTrigger><AccordionContent><p className="review-result">{snapshot.review ? `監査に記録されたレビュー結果：${snapshot.review.verdict}${snapshot.review.unit ? ` ／ ${snapshot.review.unit}` : ''}` : snapshot.step === 'review' ? 'レビュー：依頼の記録あり、結果待ち' : snapshot.stage.reviewer ? 'この試行のレビュー完了記録はありません' : '現在の設定ではレビューを実施しません'}</p>{snapshot.artifacts.length === 0 ? <p className="muted">この工程に保存された文書はまだありません。</p> : <ul className="artifact-list">{snapshot.artifacts.map((artifact) => <li key={artifact.path}><Button variant="ghost" className="artifact-button" onClick={() => void openArtifact(artifact.path)}><FileText size={14} /><span>{artifact.name}{artifact.unit && <small>{artifact.unit}</small>}</span><ChevronRight size={14} /></Button></li>)}</ul>}</AccordionContent></AccordionItem>
          <AccordionItem value="stages"><AccordionTrigger><span className="detail-label"><Layers3 size={16} />工程マップ・担当</span></AccordionTrigger><AccordionContent><WorkflowMap snapshot={snapshot} /></AccordionContent></AccordionItem>
          <AccordionItem value="events"><AccordionTrigger><span className="detail-label"><Clock3 size={16} />直近の動き</span></AccordionTrigger><AccordionContent>{snapshot.events.length ? <ol className="event-list">{snapshot.events.map((event) => <li key={event.id}><time dateTime={event.at}>{time(event.at)}</time><div>{event.label}{event.stage && <small>{snapshot.stages.find((stage) => stage.slug === event.stage)?.name ?? event.stage}{event.unit ? ` ／ ${event.unit}` : ''}</small>}</div></li>)}</ol> : <p className="muted">監査イベントはまだありません。</p>}</AccordionContent></AccordionItem>
        </Accordion>
        <footer className="app-footer"><div><span className={`connection-dot ${error ? 'offline' : ''}`} />{mode === 'demo' ? 'デモ・架空の記録' : error ? '更新失敗・前回の記録' : '読み取り専用'}</div><div>最終記録 {time(snapshot.lastEventAt)}</div><div className="footer-bottom"><span>AI-DLC {snapshot.version}</span><Button variant="ghost" size="sm" aria-pressed={!motion} onClick={() => setMotion((value) => !value)}>{motion ? '動きを止める' : '動きを戻す'}</Button></div></footer>
      </>}
      <Dialog open={documentView !== null} onOpenChange={(open) => { if (!open) closeArtifact(); }}><DialogContent showCloseButton={false} className="document-dialog"><div className="document-heading"><DialogTitle>{documentView?.name ?? '成果物'}</DialogTitle><DialogClose render={<Button variant="ghost" size="icon" aria-label="成果物を閉じる" />}><X /></DialogClose></div><DialogDescription>閲覧専用</DialogDescription>{documentError ? <output>{documentError}</output> : <pre>{documentView?.text || '読み込んでいます…'}</pre>}</DialogContent></Dialog>
    </main>
  );
}
