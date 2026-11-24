function decode(text) {
  return text.replace(/&(?:amp|quot|apos|lt|gt|#39|#x[0-9a-f]+|#\d+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const hex = entity.toLowerCase().startsWith('&#x');
    const value = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  });
}
export function clean(value, limit = 2000) {
  return typeof value === 'string' ? decode(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : null;
}
export function extractMetadata(html) {
  const metadata = {};
  // Static metadata only; never execute scripts or guess counters from localized prose.
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? html;
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    const name = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (name && attrs.content && metadata[name] === undefined) metadata[name] = clean(attrs.content);
  }
  return {
    title: metadata['og:title'] ?? metadata['twitter:title'] ?? clean(head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]),
    description: metadata['og:description'] ?? metadata['twitter:description'] ?? metadata.description ?? null,
    image: metadata['og:image'] ?? metadata['twitter:image'] ?? null,
    canonical: metadata['og:url'] ?? null
  };
}

export function classifyPage(html, finalUrl, metadata, platform) {
  const path = new URL(finalUrl).pathname;
  const title = metadata.title ?? '';
  if (/\/accounts\/login|\/i\/flow\/login|^\/login\/?$/i.test(path) || /^(?:log\s?in|log into|sign\s?in)(?:\s|$)/i.test(title) || /^(?:facebook\s*[-–|]\s*log|instagram\s*[-–|]\s*log)/i.test(title)) return 'login-required';
  if (/^\/consent|consent\.youtube/i.test(finalUrl) || /^(?:before you continue|consent)/i.test(title)) return 'blocked';
  if (/captcha|verify you are human|security check|access denied|just a moment|you.ve been blocked/i.test(title) || /id=["']challenge-form/.test(html)) return 'blocked';
  const genericTitles = {
    instagram: /^(?:instagram|instagram from meta)$/i,
    youtube: /^(?:youtube|home\s*[-–|]\s*youtube)$/i,
    reddit: /^(?:reddit|reddit\s*[-–:]\s*(?:dive into anything|the heart of the internet))$/i,
    twitter: /^(?:x|twitter|x\.\s*it.s what.s happening.*|twitter\.\s*it.s what.s happening.*)$/i,
    facebook: /^(?:facebook|facebook\s*[-–|]\s*(?:log in or sign up|login or sign up))$/i
  };
  if (!title || genericTitles[platform].test(title)) return 'unavailable';
  return 'partial';
}
