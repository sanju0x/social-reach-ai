import { platforms, targetFor } from './platforms.js';
import { request, AccessError } from './http.js';
import { extractMetadata, classifyPage, clean } from './metadata.js';
export { platforms, targetFor, normalizePlatform } from './platforms.js';
export { audit, analyze, validateSnapshot } from './analyze.js';

export class SocialReach {
  constructor({ fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBytes = 2_000_000 } = {}) {
    this.options = { fetchImpl, timeoutMs, maxBytes };
    this.adapters = new Map();
  }
  register(platform, adapter) {
    const name = targetFor(platform, 'example').platform;
    if (typeof adapter !== 'function') throw new TypeError('Adapter must be a function');
    this.adapters.set(name, adapter); return this;
  }
  async check(platform, input) {
    const target = targetFor(platform, input);
    if (this.adapters.has(target.platform)) {
      const { validateSnapshot } = await import('./analyze.js');
      const snapshot = validateSnapshot(await this.adapters.get(target.platform)(target));
      if (snapshot.platform !== target.platform || snapshot.handle !== target.handle || snapshot.url !== target.url) throw new TypeError('Adapter result must match requested platform, handle, and canonical URL');
      return snapshot;
    }
    const snapshot = {
      schemaVersion: 1, ...target, checkedAt: new Date().toISOString(), status: 'unavailable',
      profile: { displayName: null, bio: null, avatar: null, professional: null },
      metrics: {}, posts: [], evidence: [],
      limitations: ['Public metadata only; counts, posts, and account type may be unavailable.', 'Private reach, retention, account health, restrictions, and monetization cannot be determined.']
    };
    try {
      const response = await request(target.url, { ...this.options, allowedHosts: platforms[target.platform].hosts, headers: { 'user-agent': 'social-reach-ai/0.1.0 (public profile metadata reader)', accept: 'text/html' } });
      snapshot.httpStatus = response.httpStatus;
      if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new AccessError('unavailable', 'Expected an HTML profile page');
      const metadata = extractMetadata(response.text);
      snapshot.status = classifyPage(response.text, response.url, metadata, target.platform);
      if (metadata.canonical) {
        try {
          const canonical = targetFor(target.platform, metadata.canonical);
          // YouTube publishes channel IDs as canonical URLs for handle pages.
          const channelAlias = target.platform === 'youtube' && !target.handle.startsWith('channel/') && canonical.handle.startsWith('channel/');
          if (canonical.url !== target.url && !channelAlias) snapshot.status = 'unavailable';
          if (channelAlias) snapshot.limitations.push('YouTube supplied a channel ID canonical URL for this handle; the mapping is not independently verified.');
        } catch { snapshot.status = 'unavailable'; }
      }
      // Redirects to other profiles must never become evidence for the requested account.
      if (snapshot.status === 'partial') {
        try { if (targetFor(target.platform, response.url).url !== target.url) snapshot.status = 'unavailable'; }
        catch { snapshot.status = 'unavailable'; }
      }
      if (snapshot.status === 'partial') {
        snapshot.profile.displayName = clean(metadata.title, 300);
        snapshot.profile.bio = metadata.description;
        try { if (metadata.image && new URL(metadata.image).protocol === 'https:') snapshot.profile.avatar = metadata.image; } catch { /* Missing/invalid public image. */ }
        for (const [field, value] of Object.entries(snapshot.profile)) {
          if (value !== null) snapshot.evidence.push({ field: `profile.${field}`, value, source: response.url, method: 'public-html-meta' });
        }
        snapshot.limitations.push('Metadata may be abbreviated, stale, or include platform boilerplate; profile existence is not independently verified.');
      } else snapshot.limitations.push('The response did not expose usable profile metadata; this is not evidence of an account problem.');
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      snapshot.status = error.status;
      if (error.httpStatus) snapshot.httpStatus = error.httpStatus;
      snapshot.limitations.push(error.status === 'not-found' ? 'HTTP 404 was returned; the account may be unavailable, renamed, or hidden. Deletion is not confirmed.' : error.message);
    }
    return snapshot;
  }
}
