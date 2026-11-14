// 저장소 소유자가 등록한 이슈를 data/library.json에 반영
//  · [레퍼런스 추가] 이슈 폼 (라벨 add-reference)
//  · [변경 반영] 사이트의 ‘GitHub에 반영’ 버튼 (라벨 apply-changes)
// 결과: issue-reply.md(답글), issue-close(닫기 표시) 파일을 작업 폴더에 남김
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyOps, uid, resolveCategory } from '../lib/library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OPS_MARK = '<!-- booth-atlas:ops -->';
const MAX_OPS = 1000;

export function parseFormBody(body) {
  const out = {};
  const parts = String(body || '').split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const label = (nl < 0 ? p : p.slice(0, nl)).trim();
    let value = (nl < 0 ? '' : p.slice(nl + 1)).trim();
    if (value === '_No response_') value = '';
    out[label] = value;
  }
  return out;
}

function pick(form, prefix) {
  const k = Object.keys(form).find((l) => l.startsWith(prefix));
  return k ? form[k] : '';
}

export function parseOps(body) {
  const b = String(body || '');
  const i = b.indexOf(OPS_MARK);
  const rest = i >= 0 ? b.slice(i + OPS_MARK.length) : b;
  const s = rest.indexOf('{');
  const e = rest.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('변경 데이터(JSON)를 찾지 못했습니다.');
  const data = JSON.parse(rest.slice(s, e + 1));
  const ops = Array.isArray(data) ? data : data && Array.isArray(data.ops) ? data.ops : null;
  if (!ops) throw new Error('변경 목록(ops)이 없습니다.');
  if (ops.length > MAX_OPS) throw new Error(`한 번에 ${MAX_OPS}건까지 반영할 수 있습니다.`);
  return ops.filter((o) => o && typeof o === 'object' && typeof o.op === 'string' && typeof o.cid === 'string');
}

export function handleIssue(issue, lib, { owner, now = new Date().toISOString() } = {}) {
  const login = issue?.user?.login;
  if (!(issue?.author_association === 'OWNER' || (owner && login === owner))) return { kind: 'ignored', reply: null, close: false, changed: false };
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const title = String(issue.title || '');
  const body = String(issue.body || '');
  let ops;
  let kind;
  try {
    if (labels.includes('apply-changes') || title.startsWith('[변경 반영]') || body.includes(OPS_MARK)) {
      kind = 'changes';
      ops = parseOps(body);
    } else if (labels.includes('add-reference') || title.startsWith('[레퍼런스 추가]')) {
      kind = 'add';
      const f = parseFormBody(body);
      const url = pick(f, '원문 링크');
      const tags = pick(f, '참고 용도').split(/[,，、\n]/).map((t) => t.trim()).filter(Boolean);
      const formTitle = pick(f, '제목') || title.replace(/^\[레퍼런스 추가\]\s*/, '');
      let source = pick(f, '출처');
      if (!source) { try { source = new URL(url).hostname.replace(/^www\./, ''); } catch { source = '직접 추가'; } }
      ops = [{
        cid: 'issue-' + issue.number, at: now, op: 'add',
        item: { id: uid(), title: formTitle, url, image: pick(f, '이미지 주소'), source, category: resolveCategory(pick(f, '부스 카테고리') || '미분류', lib.categoryAliases, lib.categories), tags, note: pick(f, '참고할 점') },
      }];
    } else return { kind: 'ignored', reply: null, close: false, changed: false };
  } catch (e) {
    return { kind: kind || 'error', reply: `⚠️ 반영하지 못했습니다: ${e.message}\n\n사이트에서 ‘변경 내보내기’로 받은 파일 내용을 그대로 붙여넣었는지 확인해주세요.`, close: false, changed: false };
  }
  const done = new Set(lib.appliedChanges || []);
  const todo = ops.filter((o) => !done.has(o.cid));
  const { applied, results } = applyOps(lib, todo, { now, listingUrls: lib.listingUrls || [] });
  lib.appliedChanges = [...(lib.appliedChanges || []), ...applied].slice(-3000);
  const okN = results.filter((r) => r.ok && !r.duplicate).length;
  const dupN = results.filter((r) => r.duplicate).length;
  const badN = results.filter((r) => !r.ok).length;
  const skipped = ops.length - todo.length;
  const lines = [kind === 'add' ? (dupN ? '이미 라이브러리에 있는 자료라 새로 추가하지 않았습니다.' : (okN ? '✅ 레퍼런스를 추가했습니다.' : '⚠️ 제목과 https 원문 링크를 확인해주세요.')) : `✅ 변경 ${okN}건을 반영했습니다.`];
  if (kind === 'changes' && dupN) lines.push(`· 이미 있는 자료라 건너뛴 추가 ${dupN}건`);
  if (badN && kind === 'changes') lines.push(`· 대상이 없거나 형식이 맞지 않아 건너뛴 변경 ${badN}건`);
  if (skipped) lines.push(`· 이미 반영된 변경 ${skipped}건`);
  lines.push('', '사이트는 1~2분 안에 다시 배포됩니다. 새로고침하면 이 브라우저의 ‘미반영 변경’ 표시도 사라집니다.');
  const changed = applied.length > 0;
  if (changed) { lib.revision = (lib.revision || 0) + 1; }
  return { kind, reply: lines.join('\n'), close: kind === 'changes' ? true : okN > 0 || dupN > 0, changed };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const libPath = path.join(ROOT, 'data/library.json');
  const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  const r = handleIssue(event.issue, lib, { owner: process.env.REPO_OWNER });
  console.log('이슈 처리:', r.kind, r.changed ? '변경됨' : '변경 없음');
  if (r.changed) fs.writeFileSync(libPath, JSON.stringify(lib, null, 1) + '\n');
  if (r.reply) fs.writeFileSync('issue-reply.md', r.reply + '\n');
  if (r.close) fs.writeFileSync('issue-close', '1');
}
