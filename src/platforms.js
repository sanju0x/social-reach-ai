export const platforms = Object.freeze({
  instagram: Object.freeze({ host: 'www.instagram.com', hosts: ['www.instagram.com', 'instagram.com'], description: 'Public profile metadata; frequently login-gated. Insights and account type are unknown.' }),
  youtube: Object.freeze({ host: 'www.youtube.com', hosts: ['www.youtube.com', 'youtube.com'], description: 'Public channel metadata. Retention, reach, and policy status need owner access.' }),
  reddit: Object.freeze({ host: 'www.reddit.com', hosts: ['www.reddit.com', 'reddit.com'], description: 'Public profile HTML only; frequently blocked. No anonymous Data API calls.' }),
  twitter: Object.freeze({ host: 'x.com', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'], description: 'Public profile metadata when served; login walls and empty app shells are common.' }),
  facebook: Object.freeze({ host: 'www.facebook.com', hosts: ['www.facebook.com', 'facebook.com'], description: 'Public profile/Page metadata when exposed; professional mode and insights are unknown.' })
});

export function normalizePlatform(value) {
  const key = String(value).toLowerCase();
  const name = ({ insta: 'instagram', yt: 'youtube', x: 'twitter', fb: 'facebook' })[key] ?? key;
  if (!Object.hasOwn(platforms, name)) throw new TypeError(`Unsupported platform: ${value}. Use ${Object.keys(platforms).join(', ')}`);
  return name;
}

export function targetFor(platform, input) {
  const name = normalizePlatform(platform);
  if (typeof input !== 'string' || !input.trim()) throw new TypeError('A username or profile URL is required');
  let handle = input.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(handle)) {
    const url = new URL(handle);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !platforms[name].hosts.includes(url.hostname)) throw new TypeError('Use an HTTPS profile URL on the selected platform');
    const path = url.pathname.split('/').filter(Boolean);
    if (name === 'reddit' && ['user', 'u'].includes(path[0]) && path.length === 2) handle = path[1];
    else if (name === 'youtube' && path[0] === 'channel' && path.length === 2 && /^UC[\w-]{22}$/.test(path[1])) handle = `channel/${path[1]}`;
    else if (path.length === 1) handle = path[0].replace(/^@/, '');
    else throw new TypeError('Expected a profile/channel URL, not a post or video URL');
  }
  const channelId = name === 'youtube' && /^channel\/UC[\w-]{22}$/.test(handle);
  if (!channelId && !/^[\p{L}\p{N}_.-]{1,100}$/u.test(handle)) throw new TypeError('Invalid username');
  const reserved = {
    instagram: ['accounts', 'explore', 'reels', 'p', 'direct'],
    youtube: ['watch', 'feed', 'shorts', 'playlist', 'results'],
    twitter: ['home', 'search', 'explore', 'login', 'i', 'settings'],
    facebook: ['login', 'share', 'watch', 'groups', 'profile.php'],
    reddit: ['login', 'register', 'search']
  };
  if (reserved[name].includes(handle.toLowerCase())) throw new TypeError('Expected a user profile');
  const path = name === 'reddit' ? `/user/${encodeURIComponent(handle)}/` : name === 'youtube' ? channelId ? `/${handle}` : `/@${encodeURIComponent(handle)}` : `/${encodeURIComponent(handle)}/`;
  return { platform: name, handle, url: `https://${platforms[name].host}${path}` };
}
