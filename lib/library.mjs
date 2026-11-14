// BOOTH ATLAS · 브라우저와 수집기가 함께 쓰는 순수 함수 모음
// (네트워크·파일 접근 없음 → 사이트, 수집기, 테스트에서 그대로 import)

export const DEFAULT_CATEGORIES = ['목공부스', '블럭부스', '기본부스', '트러스부스', '컨퍼런스', '복합·기타', '미분류', '정보성'];
export const EDITABLE_FIELDS = ['favorite', 'title', 'category', 'tags', 'note', 'deleted', 'separateFrom'];
const CURATED_FIELDS = ['title', 'category', 'tags', 'note'];

export function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const TRACKING_PARAM = /^(utm_.+|fromRss|trackingCode|fbclid|gclid|ref|from)$/i;

// 저장용 URL 정리: 추적 파라미터 제거, 네이버 블로그 글 주소 통일
export function cleanUrl(input) {
  const raw = String(input || '').trim();
  let u;
  try { u = new URL(raw); } catch { return raw; }
  u.hash = '';
  if (/(^|\.)blog\.naver\.com$/i.test(u.hostname)) {
    const id = u.searchParams.get('blogId');
    const no = u.searchParams.get('logNo');
    if (id && no) return `https://blog.naver.com/${id}/${no}`;
    const m = u.pathname.match(/^\/([^/]+)\/(\d+)/);
    if (m) return `https://blog.naver.com/${m[1]}/${m[2]}`;
  }
  if (/\.tistory\.com$/i.test(u.hostname) && /^\/(entry\/[^/]+|\d+)\/?$/.test(u.pathname)) u.search = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  return u.toString();
}

// 중복 비교용 키 (www·끝 슬래시·대소문자 차이 무시)
export function urlKey(input) {
  const c = cleanUrl(input);
  try {
    const u = new URL(c);
    return (u.hostname.replace(/^www\./i, '').toLowerCase() + u.pathname.replace(/\/+$/, '') + (u.search || '')).toLowerCase();
  } catch { return c.toLowerCase(); }
}

// 포트폴리오 목록 페이지(여러 사례가 같은 주소)인지: 경로가 없거나 목록 주소와 같으면 개별 원문이 아님
export function isSpecificUrl(input, listingUrls = []) {
  try {
    const u = new URL(cleanUrl(input));
    if (u.pathname.replace(/\/+$/, '') === '' && !u.search) return false;
    const key = urlKey(input);
    return !listingUrls.some((l) => urlKey(l) === key);
  } catch { return false; }
}

// 이미지 키: 크기·캐시 파라미터는 무시하고, 원본을 가리키는 파라미터만 유지
const IMAGE_KEEP_PARAMS = ['url', 'fname', 'src', 'id', 'no'];
export function imageKey(input) {
  if (!input) return '';
  try {
    const u = new URL(String(input).trim());
    const keep = new URLSearchParams();
    for (const k of IMAGE_KEEP_PARAMS) if (u.searchParams.has(k)) keep.set(k, u.searchParams.get(k));
    const q = keep.toString();
    return u.hostname.toLowerCase() + u.pathname + (q ? '?' + q : '');
  } catch { return String(input).trim(); }
}

// ── 분류 ────────────────────────────────────────────────
const TYPE_RULES = [
  ['트러스부스', /트러스|truss|トラス/i],
  ['블럭부스', /블럭|블록|block\s*(booth|system)|ブロックブース/i],
  ['목공부스', /목공|목재|원목|timber|wooden|\bwood\b|carpentry|plywood|木工/i],
  ['기본부스', /기본\s*부스|옥타|octanorm|\bocta\b|패브릭|fabric|조립\s*부스|철제\s*부스|shell\s*scheme|inline booth|基礎小間|パッケージブース|システムブース/i],
  ['컨퍼런스', /컨퍼런스|conference|세미나|seminar|심포지엄|symposium|무대\s*디자인|stage design/i],
];
const INFO = /(이유|방법|(쓰는|하는|넓히는|고르는)\s*법|배치법|기준|체크\s*포인트|체크리스트|확인해야|확인할|항목|차이가|이야기|완성되기까지|가이드|비교|선택하는|알아야|꿀팁|\btips?\b|how to|\bguide\b)/i;
const CASE = /사례|시공\s*과정|제작\s*과정|홍보관|포트폴리오|portfolio/i;

export function detectTypes(text) {
  const t = String(text || '');
  return TYPE_RULES.filter(([, re]) => re.test(t)).map(([name]) => name);
}

export function isInformational(title) {
  const t = String(title || '');
  return INFO.test(t) && !CASE.test(t);
}

// 제목(우선)과 본문 요약으로 분류. confident=true면 '자동 분류', 아니면 '분류 확인 필요'
export function classify(title, text = '', current = null) {
  if (isInformational(title)) return { category: '정보성', confident: false, reason: 'info' };
  const fromTitle = detectTypes(title);
  if (fromTitle.length === 1) return { category: fromTitle[0], confident: true, reason: 'title' };
  if (fromTitle.length > 1) {
    if (current && fromTitle.includes(current)) return { category: current, confident: false, reason: 'multi-keep' };
    return { category: '복합·기타', confident: false, reason: 'multi' };
  }
  const fromText = detectTypes(text);
  if (fromText.length === 1) return { category: fromText[0], confident: false, reason: 'text' };
  return { category: current || '미분류', confident: false, reason: 'none' };
}

// 카테고리 이름 변경 이력(categoryAliases)을 따라 현재 이름으로
export function resolveCategory(name, aliases = {}, categories = DEFAULT_CATEGORIES) {
  let n = name;
  for (let i = 0; i < 20 && aliases && Object.prototype.hasOwnProperty.call(aliases, n); i++) n = aliases[n];
  return categories.includes(n) ? n : (categories.includes('미분류') ? '미분류' : categories[0]);
}

// ── 유사 이미지 묶음 ───────────────────────────────────────
// item.dupOf = 대표 자료 id. 삭제·분리된 자료는 묶지 않음.
export function buildGroups(items) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const root = (x) => {
    let cur = x;
    const seen = new Set();
    while (cur && cur.dupOf && byId.has(cur.dupOf) && !seen.has(cur.id)) {
      seen.add(cur.id);
      const next = byId.get(cur.dupOf);
      if (next.deleted) break;
      if ((cur.separateFrom || []).includes(next.id) || (next.separateFrom || []).includes(cur.id)) break;
      cur = next;
    }
    return cur;
  };
  const groups = new Map();
  for (const x of items) {
    if (x.deleted) continue;
    const r = root(x);
    if (r.id === x.id) {
      if (!groups.has(x.id)) groups.set(x.id, { ...x, duplicates: [] });
    }
  }
  for (const x of items) {
    if (x.deleted) continue;
    const r = root(x);
    if (r.id !== x.id && groups.has(r.id)) groups.get(r.id).duplicates.push(x.id);
  }
  return [...groups.values()];
}

// 해밍 거리 (16진수 해시)
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (v) { d += v & 1; v >>= 1; }
  }
  return d;
}

export function colorDiff(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  return Math.max(...[0, 1, 2].map((i) => Math.abs((a[i] ?? 0) - (b[i] ?? 0))));
}

// ── 변경 기록 적용 ──────────────────────────────────────────
// ops: 사이트에서 만든 변경 기록. 브라우저(미반영 변경 미리보기)와 저장소 반영 워크플로가 같은 함수를 씀.
function normItem(x) {
  x.tags = Array.isArray(x.tags) ? x.tags : [];
  x.separateFrom = Array.isArray(x.separateFrom) ? x.separateFrom : [];
  x.note = x.note || '';
  return x;
}

function safeText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function isHttps(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

export function findDuplicate(items, cand, listingUrls = []) {
  const uk = isSpecificUrl(cand.url, listingUrls) ? urlKey(cand.url) : null;
  const ik = imageKey(cand.image);
  return items.find((x) => (uk && isSpecificUrl(x.url, listingUrls) && urlKey(x.url) === uk) || (ik && imageKey(x.image) === ik)) || null;
}

export function applyOps(state, ops, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const listingUrls = opts.listingUrls || [];
  state.items = (state.items || []).map(normItem);
  state.categories = Array.isArray(state.categories) && state.categories.length ? state.categories : [...DEFAULT_CATEGORIES];
  state.tags = Array.isArray(state.tags) ? state.tags : [];
  state.categoryAliases = state.categoryAliases || {};
  const byId = new Map(state.items.map((x) => [x.id, x]));
  const applied = [];
  const results = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object' || !op.op) continue;
    const at = typeof op.at === 'string' ? op.at : now;
    let res = { cid: op.cid, ok: true, affected: 0 };
    if (op.op === 'edit') {
      const x = byId.get(op.id);
      if (!x || !op.set || typeof op.set !== 'object') { res.ok = false; }
      else {
        for (const k of EDITABLE_FIELDS) {
          if (!(k in op.set)) continue;
          const v = op.set[k];
          if (k === 'favorite' || k === 'deleted') x[k] = !!v;
          else if (k === 'title') x.title = safeText(v, 200) || x.title;
          else if (k === 'note') x.note = safeText(v, 2000);
          else if (k === 'category') { if (state.categories.includes(v)) x.category = v; }
          else if (k === 'tags') x.tags = (Array.isArray(v) ? v : []).filter((t) => state.tags.includes(t));
          else if (k === 'separateFrom') x.separateFrom = [...new Set([...x.separateFrom, ...(Array.isArray(v) ? v : [])].filter((id) => typeof id === 'string'))];
        }
        if ('deleted' in op.set) x.deletedAt = x.deleted ? at : null;
        if (CURATED_FIELDS.some((k) => k in op.set)) { x.manual = true; x.review = false; }
        res.affected = 1;
      }
    } else if (op.op === 'bulk') {
      const ids = new Set(Array.isArray(op.ids) ? op.ids : []);
      for (const x of state.items) {
        if (!ids.has(x.id)) continue;
        if (op.action === 'move' && state.categories.includes(op.category)) { x.category = op.category; x.manual = true; x.review = false; res.affected++; }
        else if (op.action === 'delete' && !x.deleted) { x.deleted = true; x.deletedAt = at; res.affected++; }
        else if (op.action === 'restore' && x.deleted) { x.deleted = false; x.deletedAt = null; res.affected++; }
      }
    } else if (op.op === 'categories') {
      const name = safeText(op.name, 40);
      if (op.action === 'add' && name && !state.categories.includes(name)) {
        const i = state.categories.indexOf('미분류');
        state.categories.splice(i < 0 ? state.categories.length : i, 0, name);
        res.affected = 1;
      } else if (op.action === 'rename') {
        const nn = safeText(op.newName, 40);
        const i = state.categories.indexOf(name);
        if (i >= 0 && name !== '미분류' && nn && !state.categories.includes(nn)) {
          state.categories[i] = nn;
          state.categoryAliases[name] = nn;
          for (const x of state.items) if (x.category === name) { x.category = nn; res.affected++; }
        } else res.ok = false;
      } else res.ok = false;
    } else if (op.op === 'tags') {
      const name = safeText(op.name, 30);
      if (op.action === 'add' && name && !state.tags.includes(name)) { state.tags.push(name); res.affected = 1; }
      else if (op.action === 'rename') {
        const nn = safeText(op.newName, 30);
        const i = state.tags.indexOf(name);
        if (i >= 0 && nn && !state.tags.includes(nn)) {
          state.tags[i] = nn;
          for (const x of state.items) x.tags = x.tags.map((t) => (t === name ? nn : t));
          res.affected = 1;
        } else res.ok = false;
      } else if (op.action === 'delete') {
        state.tags = state.tags.filter((t) => t !== name);
        for (const x of state.items) x.tags = x.tags.filter((t) => t !== name);
        res.affected = 1;
      } else res.ok = false;
    } else if (op.op === 'add') {
      const it = op.item || {};
      const url = cleanUrl(it.url);
      const image = it.image && isHttps(it.image) ? String(it.image).trim() : '';
      const title = safeText(it.title, 200);
      if (!title || !isHttps(url)) { res.ok = false; }
      else if (findDuplicate(state.items, { url, image }, listingUrls)) { res.ok = true; res.duplicate = true; }
      else {
        const id = typeof it.id === 'string' && it.id.length <= 64 && !byId.has(it.id) ? it.id : uid();
        const x = normItem({
          id, title, url, image,
          source: safeText(it.source, 60) || (() => { try { return new URL(url).hostname; } catch { return '직접 추가'; } })(),
          category: state.categories.includes(it.category) ? it.category : '미분류',
          tags: (Array.isArray(it.tags) ? it.tags : []).filter((t) => state.tags.includes(t)),
          note: safeText(it.note, 2000),
          favorite: false, manual: true, review: false,
          createdAt: at, separateFrom: [],
        });
        state.items.push(x);
        byId.set(id, x);
        res.affected = 1;
      }
    } else res.ok = false;
    if (op.cid) applied.push(op.cid);
    results.push(res);
  }
  return { state, applied, results };
}
