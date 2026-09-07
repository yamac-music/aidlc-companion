import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { catalog, readArtifact, readSnapshot } from './reader.mjs';

const errors = {
  NOT_CONFIGURED: '観測するプロジェクトが未設定です。READMEの接続手順で設定してください。',
  UNKNOWN_INTENT: 'この作業は見つかりません。作業の一覧を更新してください。',
  INVALID_STATE: '工程の記録を読み取れませんでした。AI-DLC側の状態を確認してください。',
  INVALID_REGISTRY: '作業の一覧を読み取れませんでした。',
  STATE_CHANGING: '工程の記録が更新中です。少し待つと自動で再取得します。',
  FILE_LIMIT: '記録が読み取り上限を超えています。', AUDIT_LIMIT: '監査ファイルの数が読み取り上限を超えています。', ARTIFACT_LIMIT: '成果物の数が読み取り上限を超えています。',
  INVALID_PATH: 'この場所は読み取り対象外です。', INVALID_ARTIFACT: 'この成果物は読み取り対象外です。',
};
export async function loadConfiguration(cwd) {
  if (process.env.AIDLC_PROJECT_ROOT) return { projectRoot: resolve(process.env.AIDLC_PROJECT_ROOT) };
  try { return JSON.parse(await readFile(resolve(cwd, '.local/config.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
export function createHandler(configuration) {
  const cache = new Map();
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/aidlc/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); } catch { return send(400, { error: 'リクエストを読み取れません。' }); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        (req.headers.origin && req.headers.origin !== url.origin) ||
        (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) return send(403, { error: 'この端末のアプリ画面から利用してください。' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'このアプリは記録の閲覧専用です。' }); }
    if (!configuration.projectRoot) return send(503, { error: errors.NOT_CONFIGURED });
    const selection = url.searchParams.has('intent') ? { space: url.searchParams.get('space'), intent: url.searchParams.get('intent') } : undefined;
    try {
      if (url.pathname === '/api/aidlc/catalog') return send(200, await catalog(configuration.projectRoot));
      if (url.pathname === '/api/aidlc/snapshot') {
        const key = JSON.stringify(selection ?? null);
        let entry = cache.get(key);
        if (!entry || Date.now() - entry.at > 1000) {
          if (cache.size > 100) cache.clear();
          entry = { at: Date.now(), promise: readSnapshot(configuration.projectRoot, selection) };
          cache.set(key, entry);
        }
        try { return send(200, await entry.promise); } catch (error) { cache.delete(key); throw error; }
      }
      if (url.pathname === '/api/aidlc/artifact') return send(200, await readArtifact(configuration.projectRoot, selection, url.searchParams.get('path')));
      return send(404, { error: 'ページが見つかりません。' });
    } catch (error) {
      const status = ['INVALID_PATH', 'INVALID_ARTIFACT', 'UNKNOWN_INTENT'].includes(error.message) ? 400 : 503;
      return send(status, { error: errors[error.message] ?? '記録を読み取れませんでした。プロジェクトの場所とファイルを確認してください。' });
    }
  };
}
