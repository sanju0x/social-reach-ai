export class AccessError extends Error {
  constructor(status, message, httpStatus = null) {
    super(message); this.name = 'AccessError'; this.status = status; this.httpStatus = httpStatus;
  }
}

export async function request(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBytes = 2_000_000, allowedHosts, ...init } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxBytes) || maxBytes <= 0) throw new TypeError('Invalid request limits');
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = new URL(url);
      if (allowedHosts && (target.protocol !== 'https:' || target.port || target.username || target.password || !allowedHosts.includes(target.hostname))) throw new AccessError('blocked', 'Redirect outside approved platform hosts');
      const response = await fetchImpl(target.href, { ...init, redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!allowedHosts) throw new AccessError('blocked', 'API redirects are not followed');
        if (!location || redirects === 3) throw new AccessError('unavailable', 'Invalid or excessive redirects');
        url = new URL(location, target).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const status = response.status === 429 ? 'rate-limited' : response.status === 401 ? 'login-required' : response.status === 403 ? 'blocked' : response.status === 404 ? 'not-found' : 'unavailable';
        throw new AccessError(status, `HTTP ${response.status}`, response.status);
      }
      const reader = response.body?.getReader();
      const chunks = []; let length = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > maxBytes) { await reader.cancel(); throw new AccessError('unavailable', 'Response exceeds size limit'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { text: new TextDecoder().decode(bytes), url: target.href, httpStatus: response.status, contentType: response.headers.get('content-type') ?? '' };
    }
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('unavailable', signal.aborted ? 'Request timed out' : 'Network request failed');
  }
}
