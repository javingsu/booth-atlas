// 순수 파서: HTML/RSS 문자열 → 후보 자료 (네트워크 없음, 테스트 가능)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·' };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

export function unCdata(s) {
  return String(s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
}

export function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? unCdata(m[1]).trim() : '';
}

export function attr(tagHtml, name) {
  const m = String(tagHtml).match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
}

export function absolutize(u, base) {
  if (!u || /^data:/i.test(u)) return '';
  try { return new URL(u, base).toString(); } catch { return ''; }
}

const JUNK_IMAGE = /logo|icon|sprite|blank|spacer|loading|placeholder|btn_|button|banner_top|avatar|emoji|1x1|pixel/i;

export function imgSrc(imgTag, base) {
  const cands = [attr(imgTag, 'data-src'), attr(imgTag, 'data-lazy-src'), attr(imgTag, 'data-original'), attr(imgTag, 'src')];
  for (const c of cands) {
    const a = absolutize(c, base);
    if (a && /^https:/i.test(a)) return a;
  }
  const srcset = attr(imgTag, 'srcset');
  if (srcset) {
    const last = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const a = absolutize(last, base);
    if (a && /^https:/i.test(a)) return a;
  }
  return '';
}

export function firstImage(html, base) {
  for (const m of String(html ?? '').matchAll(/<img\b[^>]*>/gi)) {
    const s = imgSrc(m[0], base);
    if (s && !JUNK_IMAGE.test(s)) return s;
  }
  return '';
}

// RSS 2.0 / Atom 공통
export function parseFeed(xml) {
  const text = String(xml ?? '');
  const out = [];
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const blocks = text.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let link = '';
    if (isAtom) {
      const lm = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i) || b.match(/<link\b[^>]*>/i);
      link = lm ? attr(lm[0], 'href') : '';
    } else link = decodeEntities(tag(b, 'link'));
    const descHtml = isAtom ? (tag(b, 'content') || tag(b, 'summary')) : (tag(b, 'content:encoded') || tag(b, 'description'));
    const description = decodeEntities(descHtml);
    out.push({
      title: stripTags(decodeEntities(tag(b, 'title'))),
      link: link.trim(),
      descriptionHtml: description,
      text: stripTags(description).slice(0, 600),
      pubDate: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || '',
      categories: [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripTags(unCdata(m[1]))),
      image: firstImage(description, link) || (() => { const e = b.match(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*>/i); const u = e ? attr(e[0], 'url') : ''; return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) ? u : ''; })(),
    });
  }
  return out;
}

// og:image / twitter:image
export function parseOgImage(html, base) {
  const metas = String(html ?? '').match(/<meta\b[^>]*>/gi) || [];
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const m of metas) {
      const p = (attr(m, 'property') || attr(m, 'name')).toLowerCase();
      if (p === key) {
        const u = absolutize(attr(m, 'content'), base);
        if (u && /^https:/i.test(u) && !JUNK_IMAGE.test(u)) return u;
      }
    }
  }
  const l = String(html ?? '').match(/<link\b[^>]*rel=["']image_src["'][^>]*>/i);
  if (l) { const u = absolutize(attr(l[0], 'href'), base); if (u && /^https:/i.test(u)) return u; }
  return '';
}

export function parseOgTitle(html) {
  const metas = String(html ?? '').match(/<meta\b[^>]*>/gi) || [];
  for (const m of metas) if ((attr(m, 'property') || attr(m, 'name')).toLowerCase() === 'og:title') return attr(m, 'content');
  return stripTags(tag(String(html ?? ''), 'title'));
}

// 이미지 모드: 패턴에 맞는 <img>를 모두 사례로 (목록 페이지 주소를 원문으로)
export function extractImages(html, pageUrl, { imagePattern, max = 60 } = {}) {
  const re = imagePattern ? new RegExp(imagePattern, 'i') : null;
  const seen = new Set();
  const out = [];
  for (const m of String(html ?? '').matchAll(/<img\b[^>]*>/gi)) {
    const src = imgSrc(m[0], pageUrl);
    if (!src || JUNK_IMAGE.test(src) || (re && !re.test(src)) || seen.has(src)) continue;
    seen.add(src);
    const title = (attr(m[0], 'alt') || attr(m[0], 'title')).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    out.push({ title, url: pageUrl, image: src, text: attr(m[0], 'data-lightbox-caption') });
    if (out.length >= max) break;
  }
  return out;
}

// 카드 모드: 이미지를 감싼 링크 = 개별 사례
export function extractCards(html, pageUrl, { linkPattern, imagePattern, max = 60 } = {}) {
  const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const lre = linkPattern ? new RegExp(linkPattern, 'i') : null;
  const ire = imagePattern ? new RegExp(imagePattern, 'i') : null;
  const seen = new Set();
  const out = [];
  for (const m of String(html ?? '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = absolutize(attr('<a ' + m[1] + '>', 'href'), pageUrl);
    if (!href || !/^https:/i.test(href)) continue;
    let h;
    try { h = new URL(href); } catch { continue; }
    if (h.hostname.replace(/^www\./, '') !== host) continue;
    if (lre && !lre.test(href)) continue;
    const img = m[2].match(/<img\b[^>]*>/i);
    if (!img) continue;
    const src = imgSrc(img[0], pageUrl);
    if (!src || JUNK_IMAGE.test(src) || (ire && !ire.test(src))) continue;
    const key = href.split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const title = (attr(img[0], 'alt') || attr('<a ' + m[1] + '>', 'title') || stripTags(m[2])).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    out.push({ title, url: key, image: src, text: '' });
    if (out.length >= max) break;
  }
  return out;
}
