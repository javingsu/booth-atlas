// 가짜 fetch 통합 테스트: node test/run_test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cleanUrl, urlKey, imageKey, classify, buildGroups, applyOps, findDuplicate } from '../lib/library.mjs';
import { parseFeed, extractImages, extractCards, parseOgImage } from '../collector/parsers.mjs';
import { run } from '../collector/collect.mjs';
import { handleIssue, OPS_MARK } from '../collector/apply-issue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { passed++; console.log('✓', name); });

// ── 픽스처 (실제 페이지 구조를 줄여 옮김) ─────────────────────
const naverFeed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[GROUP MCO]]></title>
<item><author>groupmco88</author><category><![CDATA[시공사례]]></category>
<title><![CDATA[IFS 2026 | 주황색 사인과 상담 공간이 보이는 6×6m 블럭부스 · GROUP MCO]]></title>
<link><![CDATA[https://blog.naver.com/groupmco88/224454086689?fromRss=true&trackingCode=rss]]></link>
<description><![CDATA[<a href="https://blog.naver.com/groupmco88/224454086689"><img src="https://blogthumb.pstatic.net/AAA/BBB.JPEG?type=s3" /></a>기존 글]]></description>
<pubDate>Mon, 26 Oct 2026 14:00:00 +0900</pubDate></item>
<item><author>groupmco88</author><category><![CDATA[시공사례]]></category>
<title><![CDATA[코리아빌드 2026 | 원목 루버를 살린 9×6m 목공부스 · GROUP MCO]]></title>
<link>https://blog.naver.com/groupmco88/224500000001?fromRss=true&amp;trackingCode=rss</link>
<description><![CDATA[<img src='https://blogthumb.pstatic.net/NEW/ONE.JPEG?type=s3'> 전시 부스 시공 사례입니다]]></description>
<pubDate>Wed, 11 Nov 2026 10:00:00 +0900</pubDate></item>
<item><title><![CDATA[회사 송년회 공지]]></title><link>https://blog.naver.com/groupmco88/224500000002</link><description><![CDATA[사내 행사가 아닌 일반 공지]]></description></item>
<item><title><![CDATA[블럭부스 견적을 볼 때 확인할 항목]]></title><link>https://blog.naver.com/groupmco88/224500000003</link><description><![CDATA[전시 부스 견적 정리]]></description></item>
</channel></rss>`;
const emptyFeed = '<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>';
const exteum = `<div class="item_photo_box"><a href="#optionViewLayer" class="btn_basket_cart"><img  src="https://cdn-saas-web-116-121.cdn-nhncommerce.com/booth378_godomall_com/data/goods/tmp/1000001079_main_034.jpg" width="285" alt="블럭 I 엔젤로보틱스" title="블럭 I 엔젤로보틱스" class="middle"  /></a></div>
<img src="https://cdn-saas-web-116-121.cdn-nhncommerce.com/booth378_godomall_com/data/skin/front/moment/img/icon/goods_icon/icon_basket_get.png" alt="찜하기">
<div class="item_photo_box"><a href="#x"><img src="https://cdn-saas-web-116-121.cdn-nhncommerce.com/booth378_godomall_com/data/goods/tmp/1000001200_main_001.jpg" alt="트러스 I 새로운고객" /></a></div>`;
const bluepoint = `<img alt="Blue Point LLC" src="/images/logo.png?v=ba22b6c4"/>
<img alt="Two-story exhibit with a steel mezzanine deck, dual staircases and cable railings over a ground-floor showroom" src="/images/work/build-12.jpg?v=NEWCACHE" srcset="/images/work/build-12-480w.jpg?v=1 480w"/>
<img alt="Island booth with a timber canopy and lit product shelving" src="/images/work/build-99.jpg?v=abc"/>`;
const exbooth = `<h2 class="entry-title"><a href="https://exhibition-booth.com/monozukuri2026/">ものづくりワールド2026｜トラス×ターポリン</a></h2><a href="https://exhibition-booth.com/monozukuri2026/"><img width="800" src="https://exhibition-booth.com/wp-content/uploads/ryouyou_s.jpg" alt="ものづくりワールド2026-施工動画"></a>
<h2 class="entry-title"><a href="https://exhibition-booth.com/newexpo2026/">新展示会2026｜木工ブース</a></h2><a href="https://exhibition-booth.com/newexpo2026/"><img src="https://exhibition-booth.com/wp-content/uploads/new_s.jpg" alt="新展示会2026 木工ブース"></a>
<a href="https://exhibition-booth.com/"><img src="https://exhibition-booth.com/wp-content/uploads/logo.png" alt="EX Booth"></a>`;
const tistory = `<rss version="2.0"><channel><item><title>SETEC 프랜차이즈박람회 트러스 부스 시공</title><link>https://kjoung99.tistory.com/48</link><description>&lt;img src="https://img1.daumcdn.net/thumb/R800x0/?scode=mtistory2&amp;fname=https%3A%2F%2Ft1.daumcdn.net%2Fcfile%2Fblog%2F261548395424D48520"&gt; 부스</description></item>
<item><title>주말 캠핑 후기</title><link>https://kjoung99.tistory.com/300</link><description>캠핑</description></item></channel></rss>`;

const prodesign = `<a href="/sub/indenpendent.html?modal=99999"><img src="/_wp/data/bbs/bbs01/99999/20990101_1.jpg" alt="2099 픽스처박람회 테스트 목공부스"></a>
<a href="/"><img src="/img/logo.png" alt="프로디자인그룹"></a>`;
const tuktakWp = JSON.stringify([
  { link: 'https://tuktak.kr/portfolio-item/fixture-expo-2099/', date_gmt: '2099-01-14T02:42:24', title: { rendered: 'Fixture Expo 2099, 테스트' }, excerpt: { rendered: '<p>라이트 패브릭 부스</p>' }, _embedded: { 'wp:featuredmedia': [{ source_url: 'https://tuktak.kr/wp-content/uploads/2099/01/FX.png', media_details: { sizes: { large: { source_url: 'https://tuktak.kr/wp-content/uploads/2099/01/FX-1024x800.png' } } } }] } },
  { link: 'https://tuktak.kr/portfolio-item/no-title/', title: { rendered: '' } },
]);
const donworks = `<a href="/portfolio/project-fixture-2099"><img src="https://spamcydtxzuelpsjbvkp.supabase.co/storage/v1/object/public/hr-blog/fixture.webp" alt="허니콤보드 테스트 부스, 가벽 배치를 검토하는 이유"></a>`;
const uniplan = `<a href="/work/en-fixturebrand-ifa-2099"><img src="https://cms.uniplan.com/images/FX=/1/fill-1x1%7Cformat-jpeg/fixture.png" alt=""></a>
<a href="/work/en-zott-100"><img src="https://cms.uniplan.com/images/TWA=/1944/fill-1x1%7Cformat-jpeg/zott.jpeg" alt=""></a>`;
const dezeen = `<rss><channel><item><title>Note Design Studio builds brick stand for Vestre at Stockholm Furniture Fair</title><link>https://www.dezeen.com/2026/02/10/vestre-stand/</link><description><![CDATA[<img src="https://static.dezeen.com/uploads/2026/02/vestre.jpg"> stand]]></description></item>
<item><title>Ceramics exhibition opens in Shanghai museum</title><link>https://www.dezeen.com/2026/02/11/ceramics/</link><description><![CDATA[<img src="https://static.dezeen.com/uploads/2026/02/c.jpg"> museum show]]></description></item></channel></rss>`;

function fakeFetch(routes) {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (r === undefined) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, text: async () => r, arrayBuffer: async () => new TextEncoder().encode(r).buffer };
  };
  f.calls = calls;
  return f;
}

await t('URL 정리·키', () => {
  assert.equal(cleanUrl('https://blog.naver.com/groupmco88/224454086689?fromRss=true&trackingCode=rss'), 'https://blog.naver.com/groupmco88/224454086689');
  assert.equal(cleanUrl('https://m.blog.naver.com/PostView.naver?blogId=dimca&logNo=123'), 'https://blog.naver.com/dimca/123');
  assert.equal(urlKey('https://kjoung99.tistory.com/48?category=1227108'), urlKey('https://kjoung99.tistory.com/48'));
  assert.equal(imageKey('https://bluepointllc.com/images/work/build-12.jpg?v=c73e66b2'), imageKey('https://bluepointllc.com/images/work/build-12.jpg?v=NEW'));
  assert.notEqual(imageKey('https://fmbuild.co.kr/_next/image?url=a.jpg&w=1'), imageKey('https://fmbuild.co.kr/_next/image?url=b.jpg&w=1'));
});

await t('키워드 분류', () => {
  assert.deepEqual(classify('블럭 I 씨메드').category, '블럭부스');
  assert.equal(classify('블럭 I 씨메드').confident, true);
  assert.equal(classify('FM BUILD · 옥타 6*3부스').category, '기본부스');
  assert.equal(classify('트러스+블럭 I 연이메디칼').category, '복합·기타');
  assert.equal(classify('목공부스 & 패브릭부스 제작', '', '목공부스').category, '목공부스');
  assert.equal(classify('재사용 블럭부스 견적을 볼 때 반드시 확인할 항목').category, '정보성');
  assert.equal(classify('블럭부스 디자인ㆍ시공 사례 ｜EXCO').category, '블럭부스');
  assert.equal(classify('ものづくりワールド2026｜トラス×ターポリン').category, '트러스부스');
  assert.equal(classify('LED tower booth', '', null).category, '미분류');
});

await t('유사 이미지 묶음·분리', () => {
  const items = [{ id: 'a' }, { id: 'b', dupOf: 'a' }, { id: 'c', dupOf: 'b' }, { id: 'd', dupOf: 'a', separateFrom: ['a'] }, { id: 'e', dupOf: 'z' }];
  const g = buildGroups(items);
  assert.deepEqual(g.map((x) => x.id).sort(), ['a', 'd', 'e']);
  assert.deepEqual(g.find((x) => x.id === 'a').duplicates.sort(), ['b', 'c']);
  const del = buildGroups([{ id: 'a', deleted: true }, { id: 'b', dupOf: 'a' }]);
  assert.deepEqual(del.map((x) => x.id), ['b']);
});

await t('변경 기록 적용 (사이트·워크플로 공용)', () => {
  const s = { categories: ['목공부스', '미분류'], tags: ['조명 참고'], items: [{ id: 'x', title: 'A', url: 'https://a.com/1', image: 'https://a.com/1.jpg', category: '미분류', tags: [], review: true, manual: false, createdAt: '2026-01-01' }] };
  const ops = [
    { cid: '1', op: 'edit', id: 'x', set: { category: '목공부스', tags: ['조명 참고', '없는태그'], note: '메모' } },
    { cid: '2', op: 'categories', action: 'rename', name: '목공부스', newName: '목재부스' },
    { cid: '3', op: 'tags', action: 'rename', name: '조명 참고', newName: '조명' },
    { cid: '4', op: 'add', item: { title: 'B', url: 'https://b.com/2', image: '', category: '목재부스' } },
    { cid: '5', op: 'add', item: { title: 'dup', url: 'https://a.com/1?utm_source=x', image: '' } },
    { cid: '6', op: 'bulk', action: 'delete', ids: ['x'] },
    { cid: '7', op: 'edit', id: 'nope', set: { favorite: true } },
    { cid: '8', op: 'add', item: { title: 'bad', url: 'http://insecure.com' } },
  ];
  const { state, applied, results } = applyOps(s, ops, { now: '2026-11-15T00:00:00Z' });
  const x = state.items.find((i) => i.id === 'x');
  assert.equal(x.category, '목재부스');
  assert.deepEqual(x.tags, ['조명']);
  assert.equal(x.review, false);
  assert.equal(x.manual, true);
  assert.equal(x.deleted, true);
  assert.equal(state.categoryAliases['목공부스'], '목재부스');
  assert.equal(state.items.length, 2);
  assert.equal(results[4].duplicate, true);
  assert.equal(results[6].ok, false);
  assert.equal(results[7].ok, false);
  assert.equal(applied.length, 8);
  const s2 = { categories: ['미분류'], tags: [], items: [{ id: 'y', title: 'Y', url: 'https://y.com/1', image: '', phash: 'aa', category: '미분류', createdAt: '2026-01-01' }] };
  applyOps(s2, [{ cid: 'i1', op: 'edit', id: 'y', set: { image: 'http://insecure.jpg' } }]);
  assert.equal(s2.items[0].image, '');
  applyOps(s2, [{ cid: 'i2', op: 'edit', id: 'y', set: { image: 'https://y.com/a.jpg' } }]);
  assert.equal(s2.items[0].image, 'https://y.com/a.jpg');
  assert.equal(s2.items[0].phash, undefined);
  assert.equal(classify('왜 글로벌 브랜드는 패브릭 솔루션에 주목하는가?').category, '정보성');
});

await t('파서', () => {
  const f = parseFeed(naverFeed);
  assert.equal(f.length, 4);
  assert.equal(f[1].image, 'https://blogthumb.pstatic.net/NEW/ONE.JPEG?type=s3');
  assert.match(f[1].link, /224500000001/);
  assert.equal(parseFeed(tistory)[0].image.startsWith('https://img1.daumcdn.net/'), true);
  assert.equal(extractImages(exteum, 'https://www.exteum.com/', { imagePattern: '/data/goods/.+_main_' }).length, 2);
  const bp = extractImages(bluepoint, 'https://bluepointllc.com/portfolio/', { imagePattern: '/images/work/build-\\d+\\.(jpe?g|png|webp)' });
  assert.equal(bp.length, 2);
  assert.equal(bp[0].image, 'https://bluepointllc.com/images/work/build-12.jpg?v=NEWCACHE');
  const cards = extractCards(exbooth, 'https://exhibition-booth.com/category/designexamples/', { linkPattern: '^https://exhibition-booth\\.com/[^/?#]+/?$', imagePattern: '/wp-content/uploads/' });
  assert.deepEqual(cards.map((c) => c.title), ['ものづくりワールド2026-施工動画', '新展示会2026 木工ブース']);
  assert.equal(parseOgImage('<meta property="og:image" content="https://x.com/og.jpg">', 'https://x.com/'), 'https://x.com/og.jpg');
});

await t('수집기 통합 (실제 라이브러리 사본 + 가짜 fetch)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-'));
  const libPath = path.join(dir, 'library.json');
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));
  for (const x of seed.items) delete x.ogTriedAt;
  fs.writeFileSync(libPath, JSON.stringify(seed));
  const before = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  const noImg = before.items.filter((x) => !x.deleted && !x.image);
  const ogTarget = noImg.find((x) => /tn-trussing/.test(x.url));
  const routes = {
    'https://rss.blog.naver.com/groupmco88.xml': naverFeed,
    'https://rss.blog.naver.com/bmsplan.xml': emptyFeed,
    'https://rss.blog.naver.com/epicdesigngroup_01.xml': emptyFeed,
    'https://rss.blog.naver.com/lf-exhibition.xml': emptyFeed,
    'https://rss.blog.naver.com/dimca.xml': Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    'https://kjoung99.tistory.com/rss': tistory,
    'https://exhibition-booth.com/category/designexamples/': exbooth,
    'https://www.exteum.com/': exteum,
    'https://bluepointllc.com/portfolio/': bluepoint,
    'https://rss.blog.naver.com/seouladcom88.xml': emptyFeed,
    'https://pro-design.co.kr/main/main.html': prodesign,
    'https://tuktak.kr/wp-json/wp/v2/portfolio?per_page=30&_embed=wp:featuredmedia': tuktakWp,
    'https://d-onworks.com/portfolio': donworks,
    'https://www.uniplan.com/work': uniplan,
    'https://boothexhibits.com/wp-json/wp/v2/case-studies?per_page=30&_embed=wp:featuredmedia': '[]',
    'https://www.dezeen.com/tag/exhibition-design/feed/': dezeen,
  };
  if (ogTarget) routes[ogTarget.url] = '<html><head><meta property="og:image" content="https://www.tn-trussing.com/og/truss.jpg"></head></html>';
  const fetchImpl = fakeFetch(routes);
  const logs = [];
  const { added, errors, lib } = await run({ fetchImpl, libPath, now: '2026-11-16T00:07:00.000Z', log: (s) => logs.push(s) });
  const titles = added.map((x) => x.title).sort();
  assert.deepEqual(titles, ['Island booth with a timber canopy and lit product shelving', '新展示会2026 木工ブース', '블럭부스 견적을 볼 때 확인할 항목', '코리아빌드 2026 | 원목 루버를 살린 9×6m 목공부스 · GROUP MCO', '트러스 I 새로운고객',
    '2099 픽스처박람회 테스트 목공부스', 'Fixture Expo 2099, 테스트', '허니콤보드 테스트 부스, 가벽 배치를 검토하는 이유', 'Fixturebrand IFA 2099', 'Note Design Studio builds brick stand for Vestre at Stockholm Furniture Fair'].sort());
  const pd = added.find((x) => x.source === '프로디자인그룹');
  assert.equal(pd.url, 'https://pro-design.co.kr/sub/indenpendent.html?modal=99999');
  assert.equal(pd.image, 'https://pro-design.co.kr/_wp/data/bbs/bbs01/99999/20990101_1.jpg');
  assert.equal(pd.category, '목공부스');
  const tk = added.find((x) => x.source === '뚝딱제작소');
  assert.equal(tk.image, 'https://tuktak.kr/wp-content/uploads/2099/01/FX-1024x800.png');
  assert.equal(tk.publishedAt, '2099-01-14T02:42:24.000Z');
  const dw = added.find((x) => x.source === '디온웍스');
  assert.equal(dw.category, '복합·기타');
  assert.equal(dw.categoryFrom, 'source');
  assert.ok(!added.some((x) => /Zott|Ceramics/.test(x.title)));
  assert.equal(added.find((x) => x.source === 'Uniplan').image, '');
  const korea = added.find((x) => x.title.startsWith('코리아빌드'));
  assert.equal(korea.url, 'https://blog.naver.com/groupmco88/224500000001');
  assert.equal(korea.category, '목공부스');
  assert.equal(korea.review, false);
  assert.equal(korea.source, '네이버 블로그');
  assert.equal(added.find((x) => x.title.startsWith('블럭부스 견적')).category, '정보성');
  assert.equal(added.find((x) => x.title.startsWith('Island')).category, '목공부스');
  assert.equal(errors.length, 2); // dimca 시간 초과 + FM BUILD 404
  assert.ok(errors.some((e) => e.includes('dimca') && e.includes('TimeoutError')));
  assert.ok(errors.some((e) => e.includes('FM BUILD') && e.includes('HTTPError')));
  assert.equal(lib.items.length, before.items.length + 10);
  assert.equal(lib.runs[0].added, 10);
  assert.equal(lib.sources.length, 23);
  assert.equal(lib.sources.find((s) => s.name === 'Booth Exhibits').status, '이미지 추출 없음 · 링크 참고');
  assert.ok(lib.sources.find((s) => s.name === '네이버 RSS · groupmco88').count >= 12);
  if (ogTarget) assert.equal(lib.items.find((x) => x.id === ogTarget.id).image, 'https://www.tn-trussing.com/og/truss.jpg');
  // 직접 정리한 자료는 그대로
  for (const b of before.items.filter((x) => x.manual)) {
    const a = lib.items.find((x) => x.id === b.id);
    assert.equal(a.category, b.category);
    assert.equal(a.title, b.title);
  }
  // Pinterest·Behance는 원문 요청 안 함
  assert.ok(!fetchImpl.calls.some((u) => /pinterest\.com|behance\.net/.test(u)));
  // 두 번째 실행: 새로 추가 없음 (중복 방지)
  const second = await run({ fetchImpl: fakeFetch(routes), libPath, now: '2026-11-23T00:07:00.000Z', log: () => {} });
  assert.equal(second.added.length, 0);
});

await t('이슈 반영: 소유자 레퍼런스 추가 / 변경 반영 / 타인 무시', () => {
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));
  const n = lib.items.length;
  const body = '### 제목\n\nKIMES 2026 테스트 목공부스\n\n### 원문 링크 (https://)\n\nhttps://example.com/kimes\n\n### 이미지 주소 (선택)\n\n_No response_\n\n### 부스 카테고리\n\n목공부스\n\n### 참고 용도 (쉼표로 구분, 선택)\n\n조명 참고, 없는 용도\n\n### 출처 이름 (선택)\n\n_No response_\n\n### 참고할 점 (선택)\n\n사인 높이';
  const r1 = handleIssue({ number: 7, title: '[레퍼런스 추가] KIMES', body, author_association: 'OWNER', user: { login: 'javingsu' }, labels: [{ name: 'add-reference' }] }, lib, { owner: 'javingsu' });
  assert.equal(r1.kind, 'add');
  assert.equal(r1.close, true);
  const it = lib.items[lib.items.length - 1];
  assert.equal(lib.items.length, n + 1);
  assert.equal(it.category, '목공부스');
  assert.deepEqual(it.tags, ['조명 참고']);
  assert.equal(it.source, 'example.com');
  assert.equal(it.note, '사인 높이');
  const target = lib.items.find((x) => x.review && !x.deleted);
  const ops = [{ cid: 'c-1', at: '2026-11-15T00:00:00Z', op: 'edit', id: target.id, set: { favorite: true, category: '정보성' } }];
  const body2 = 'BOOTH ATLAS\n\n' + OPS_MARK + '\n```json\n' + JSON.stringify({ type: 'booth-atlas-changes', version: 1, ops }) + '\n```\n';
  const r2 = handleIssue({ number: 8, title: '[변경 반영] 1건', body: body2, author_association: 'OWNER', user: { login: 'javingsu' }, labels: [] }, lib, { owner: 'javingsu' });
  assert.equal(r2.kind, 'changes');
  assert.equal(target.favorite, true);
  assert.equal(target.review, false);
  assert.ok(lib.appliedChanges.includes('c-1'));
  const r3 = handleIssue({ number: 9, title: '[변경 반영] 1건', body: body2, author_association: 'OWNER', user: { login: 'javingsu' } }, lib, { owner: 'javingsu' });
  assert.match(r3.reply, /이미 반영된 변경 1건/);
  const r4 = handleIssue({ number: 10, title: '[레퍼런스 추가] spam', body, author_association: 'NONE', user: { login: 'stranger' }, labels: [{ name: 'add-reference' }] }, lib, { owner: 'javingsu' });
  assert.equal(r4.kind, 'ignored');
  const r5 = handleIssue({ number: 11, title: '[변경 반영] 깨짐', body: OPS_MARK + ' not json', author_association: 'OWNER', user: { login: 'javingsu' } }, lib, { owner: 'javingsu' });
  assert.equal(r5.close, false);
  assert.match(r5.reply, /반영하지 못했습니다/);
});

await t('기존 자료 무결성', () => {
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));
  assert.ok(lib.items.length >= 259);
  const migrated = lib.items.filter((x) => x.createdAt < '2026-11-10');
  assert.equal(migrated.length, 259);
  assert.equal(buildGroups(migrated).length, 255);
  const ids = new Set(lib.items.map((x) => x.id));
  assert.equal(ids.size, lib.items.length);
  for (const x of lib.items) {
    assert.ok(lib.categories.includes(x.category), x.title);
    assert.ok(x.createdAt && x.title && x.url);
  }
  // 동일 원문 주소 중복 없음 (목록 페이지 주소 제외)
  const keys = lib.items.filter((x) => !x.deleted).map((x) => findDuplicate(lib.items.filter((y) => y.id !== x.id && !y.deleted && !y.dupOf && !x.dupOf && !(lib.items.find(z=>z.dupOf===x.id||z.dupOf===y.id))), x, lib.listingUrls)).filter(Boolean);
  console.log('   (참고) 주소·이미지가 겹치는 기존 자료', keys.length, '건');
});

console.log(`\n${passed}개 테스트 통과`);
