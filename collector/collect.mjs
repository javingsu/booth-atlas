// BOOTH ATLAS 주간 수집기 — GitHub Actions에서 실행
// 공개 RSS·공개 포트폴리오 페이지만 읽습니다. 로그인·차단 우회는 하지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uid, cleanUrl, classify, resolveCategory, findDuplicate, hamming, colorDiff } from '../lib/library.mjs';
import { parseFeed, extractImages, extractCards, parseOgImage } from './parsers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

async function fetchWithTimeout(fetchImpl, url, { ua, timeoutMs = 20000, binary = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: binary ? 'image/*' : 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'ko,en;q=0.8,ja;q=0.6' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.name = 'HTTPError'; e.status = r.status; throw e; }
    if (binary) return Buffer.from(await r.arrayBuffer());
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') { const te = new Error('시간 초과'); te.name = 'TimeoutError'; throw te; }
    throw e;
  } finally { clearTimeout(t); }
}

export async function collectSource(src, getText) {
  const body = await getText(src.url);
  if (src.type === 'feed') {
    return parseFeed(body).map((x) => ({ title: x.title, url: x.link, image: x.image, text: [x.text, ...(x.categories || [])].join(' '), publishedAt: x.pubDate }));
  }
  if (src.type === 'images') return extractImages(body, src.url, { imagePattern: src.imagePattern, max: src.max || 60 });
  if (src.type === 'cards') return extractCards(body, src.url, { linkPattern: src.linkPattern, imagePattern: src.imagePattern, max: src.max || 60 });
  throw new Error('알 수 없는 수집 방식: ' + src.type);
}

function countFor(lib, rule) {
  if (!rule) return 0;
  return lib.items.filter((x) => !x.deleted && ((rule.source && x.source === rule.source) || (rule.urlIncludes && String(x.url).includes(rule.urlIncludes)))).length;
}

function toDate(s) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }

export async function fingerprint(buf, sharp) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (!sharp) return { sha256 };
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const { data } = await img.clone().removeAlpha().grayscale().resize(17, 16, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += data[y * 17 + x] > data[y * 17 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 256; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  const stats = await img.clone().removeAlpha().stats();
  const color = stats.channels.slice(0, 3).map((c) => Math.round(c.mean));
  return { sha256, phash: hex, color, hashAlgo: 'dhash256' };
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } }));
}

export async function run({ fetchImpl = globalThis.fetch, libPath = path.join(ROOT, 'data/library.json'), cfgPath = path.join(ROOT, 'collector/config.json'), now = new Date().toISOString(), sharp = null, log = console.log } = {}) {
  const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const ua = cfg.userAgent;
  const getText = (u) => fetchWithTimeout(fetchImpl, u, { ua });
  const relevance = new RegExp(cfg.relevance, 'i');
  lib.items = lib.items || [];
  lib.categories = lib.categories || [];
  const listingUrls = [...cfg.sources.filter((s) => s.listing).map((s) => s.url), ...cfg.linkOnly.map((s) => s.url)];
  lib.listingUrls = listingUrls;

  const errors = [];
  const added = [];
  let updated = 0;
  const sourceStatus = [];

  for (const src of cfg.sources) {
    let status = src.okStatus || '공개 페이지 확인';
    let found = 0;
    let fresh = 0;
    try {
      const cands = await collectSource(src, getText);
      found = cands.length;
      for (const c of cands) {
        if (fresh >= (cfg.maxNewPerSource || 30)) break;
        const cand = { ...c, title: (src.titlePrefix || '') + String(c.title || '').trim(), url: cleanUrl(c.url), image: c.image || '' };
        if (!cand.title || !/^https:/i.test(cand.url)) continue;
        if ((src.type === 'feed' || src.requireRelevance) && !relevance.test(cand.title + ' ' + (cand.text || ''))) continue;
        const dup = findDuplicate(lib.items, cand, listingUrls);
        if (dup) {
          if (!dup.image && cand.image) { dup.image = cand.image; updated++; }
          continue;
        }
        const cls = classify(cand.title, cand.text || '', null);
        const item = {
          id: uid(), title: cand.title.slice(0, 200), url: cand.url, image: cand.image, source: src.label,
          category: resolveCategory(cls.category, lib.categoryAliases, lib.categories),
          tags: [], note: '', favorite: false, manual: false, review: !cls.confident,
          createdAt: now, separateFrom: [],
        };
        const pub = toDate(cand.publishedAt);
        if (pub) item.publishedAt = pub;
        lib.items.push(item);
        added.push(item);
        fresh++;
      }
      if (!found) status = '이미지 추출 없음 · 링크 참고';
      log(`✓ ${src.name}: 후보 ${found}건 · 신규 ${fresh}건`);
    } catch (e) {
      status = `수집 실패 · ${e.name === 'Error' ? e.message : e.name}`;
      errors.push(`${src.name}: ${status}`);
      log(`✗ ${src.name}: ${e.message}`);
    }
    sourceStatus.push({ name: src.name, url: src.url, status, count: 0, _rule: src.count, newThisRun: fresh });
  }

  // 이미지 없는 자료: 원문 대표 이미지(og:image) 보충
  const skip = cfg.ogSkipHosts || [];
  const retryMs = (cfg.ogRetryDays || 30) * DAY;
  const needOg = lib.items.filter((x) => !x.deleted && !x.image && /^https:/.test(x.url) && !skip.some((h) => hostOf(x.url).endsWith(h)) && (!x.ogTriedAt || Date.parse(now) - Date.parse(x.ogTriedAt) > retryMs)).slice(0, cfg.ogBackfillPerRun || 25);
  let ogFilled = 0;
  for (const x of needOg) {
    try {
      const html = await getText(x.url);
      const og = parseOgImage(html, x.url);
      if (og) { x.image = og; x.imageFrom = 'og'; ogFilled++; updated++; }
    } catch (e) { /* 원문 접근 실패는 링크 자료로 유지 */ }
    x.ogTriedAt = now;
  }
  if (needOg.length) log(`· 대표 이미지 보충: 시도 ${needOg.length}건 · 성공 ${ogFilled}건`);

  // 이미지 지문(SHA-256, 256비트 dHash, 평균색) → 새 자료의 중복 묶음
  if (sharp) {
    const addedIds = new Set(added.map((x) => x.id));
    const todo = lib.items.filter((x) => !x.deleted && x.image && (x.hashAlgo !== 'dhash256' || addedIds.has(x.id)) && (!x.hashTriedAt || Date.parse(now) - Date.parse(x.hashTriedAt) > retryMs))
      .sort((a, b) => (addedIds.has(b.id) ? 1 : 0) - (addedIds.has(a.id) ? 1 : 0))
      .slice(0, cfg.hashPerRun || 320);
    let ok = 0;
    await pool(todo, 6, async (x) => {
      try {
        const buf = await fetchWithTimeout(fetchImpl, x.image, { ua, binary: true, timeoutMs: 15000 });
        Object.assign(x, await fingerprint(buf, sharp));
        delete x.hashTriedAt;
        ok++;
      } catch { x.hashTriedAt = now; }
    });
    log(`· 이미지 지문: ${todo.length}건 중 ${ok}건 계산`);
  }
  const byId = new Map(lib.items.map((x) => [x.id, x]));
  const rootOf = (x) => { let c = x; for (let i = 0; i < 20 && c.dupOf && byId.has(c.dupOf); i++) c = byId.get(c.dupOf); return c; };
  for (const x of added) {
    if (x.dupOf) continue;
    const match = lib.items.find((y) => y !== x && !y.deleted && !added.slice(added.indexOf(x)).includes(y) && (
      (x.sha256 && y.sha256 === x.sha256) ||
      (x.hashAlgo === 'dhash256' && y.hashAlgo === 'dhash256' && hamming(x.phash, y.phash) <= 2 && colorDiff(x.color, y.color) <= 5)
    ));
    if (match) x.dupOf = rootOf(match).id;
  }

  for (const s of sourceStatus) { s.count = countFor(lib, s._rule); delete s._rule; }
  lib.sources = [
    ...sourceStatus,
    ...cfg.linkOnly.map((s) => ({ name: s.name, url: s.url, status: s.status, count: countFor(lib, s.count) })),
  ];
  lib.runs = [{ at: now, added: added.length, updated, total: lib.items.length, errors }, ...(lib.runs || [])].slice(0, 30);
  lib.updatedAt = now;
  lib.revision = (lib.revision || 0) + 1;
  fs.writeFileSync(libPath, JSON.stringify(lib, null, 1) + '\n');
  log(`완료: 신규 ${added.length} · 갱신 ${updated} · 누적 ${lib.items.length} · 오류 ${errors.length}`);
  return { added, updated, errors, lib };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { console.log('· sharp 없음: 이미지 지문 없이 주소 기준으로만 중복을 확인합니다.'); }
  await run({ sharp });
}
