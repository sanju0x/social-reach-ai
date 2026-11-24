import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { SocialReach, targetFor, audit, analyze, validateSnapshot } from '../src/index.js';
import { request } from '../src/http.js';

const example = JSON.parse(await readFile(new URL('../examples/snapshot.json', import.meta.url), 'utf8'));
const html = '<head><meta content="Cooking &amp; recipes" property="og:description"><meta property="og:title" content="Example Creator (@example.creator)"></head>';
const page = text => new Response(text, { headers: { 'content-type': 'text/html' } });
const mock = handler => new SocialReach({ fetch: async (...args) => handler(...args) });

test('aliases and canonical profile URLs', () => {
  assert.equal(targetFor('x', '@someone').url, 'https://x.com/someone/');
  assert.equal(targetFor('yt', 'https://youtube.com/@someone').url, 'https://www.youtube.com/@someone');
  assert.equal(targetFor('reddit', 'https://reddit.com/u/someone/').handle, 'someone');
  assert.equal(targetFor('youtube', 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv').handle, 'channel/UCabcdefghijklmnopqrstuv');
});
test('reject wrong hosts, credentials, post URLs, traversal, internal targets', () => {
  for (const target of ['https://instagram.com.evil.test/user', 'http://instagram.com/user', 'https://u:p@instagram.com/user', 'https://instagram.com/p/abc', '../x', 'https://127.0.0.1/a', 'https://instagram.com:8080/user', 'accounts', 'https://instagram.com/explore']) assert.throws(() => targetFor('instagram', target));
  assert.throws(() => targetFor('__proto__', 'user'));
});
for (const platform of ['instagram', 'youtube', 'facebook', 'twitter', 'reddit']) {
  test(`${platform}: extract public metadata with evidence without auth`, async () => {
    const result = await mock((url, init) => {
      assert.equal(init.headers.cookie, undefined);
      assert.equal(init.headers.authorization, undefined);
      assert.ok(!url.includes('.json'));
      return page(html);
    }).check(platform, 'example.creator');
    assert.equal(result.status, 'partial');
    assert.equal(result.profile.bio, 'Cooking & recipes');
    assert.equal(result.profile.professional, null);
    assert.equal(result.evidence.length, 2);
    assert.deepEqual(validateSnapshot(result), result);
  });
}
test('login wall and generic app shell do not become profile evidence', async () => {
  for (const title of ['Log in • Instagram', 'Log into Instagram', 'Instagram']) {
    const result = await mock(() => page(`<title>${title}</title><meta name="description" content="Join now">`)).check('insta', 'someone');
    assert.notEqual(result.status, 'partial');
    assert.deepEqual(result.evidence, []);
  }
});
test('challenge pages report blocked', async () => {
  assert.equal((await mock(() => page('<title>Just a moment...</title>')).check('fb', 'someone')).status, 'blocked');
});
test('wrong profile canonical URLs are rejected', async () => {
  assert.equal((await mock(() => page(html.replace('</head>', '<meta property="og:url" content="https://www.instagram.com/other/"></head>'))).check('insta', 'someone')).status, 'unavailable');
});
test('redirect to a different profile is not accepted', async () => {
  let calls = 0;
  const result = await mock(() => ++calls === 1 ? new Response(null, { status: 302, headers: { location: '/someoneelse/' } }) : page(html)).check('instagram', 'someone');
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 2);
});
test('redirect outside approved hosts is never fetched', async () => {
  let calls = 0;
  const result = await mock(() => {
    calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/secrets' } });
  }).check('instagram', 'someone');
  assert.equal(result.status, 'blocked'); assert.equal(calls, 1);
});
test('HTTP statuses distinguish access failures without claiming bans', async () => {
  for (const [code, status] of [[401, 'login-required'], [403, 'blocked'], [404, 'not-found'], [429, 'rate-limited'], [503, 'unavailable']]) {
    const snapshot = await mock(() => new Response(null, { status: code })).check('reddit', 'someone');
    assert.equal(snapshot.status, status); assert.deepEqual(snapshot.evidence, []);
    assert.match(audit(snapshot).observations[0].action, /not interpret/);
  }
});
test('response size and unsupported content type fail safely', async () => {
  const client = new SocialReach({ maxBytes: 10, fetch: async () => page(html) });
  assert.equal((await client.check('fb', 'someone')).status, 'unavailable');
  assert.equal((await mock(() => new Response('{}', { headers: { 'content-type': 'application/json' } })).check('fb', 'someone')).status, 'unavailable');
});
test('network exceptions do not expose raw errors or secrets', async () => {
  const result = await mock(() => { throw Error('private-token-secret'); }).check('x', 'someone');
  assert.equal(result.status, 'unavailable'); assert.ok(!JSON.stringify(result).includes('private-token-secret'));
});
test('snapshot validation rejects mismatched evidence, invalid counts, unsupported data', () => {
  const bad = structuredClone(example); bad.evidence[0].value = 'invented';
  assert.throws(() => validateSnapshot(bad), /Evidence/);
  assert.throws(() => validateSnapshot({ ...example, metrics: { followers: -1 } }));
  assert.throws(() => validateSnapshot({ ...example, profile: { ...example.profile, professional: 'yes' } }));
  assert.throws(() => validateSnapshot({ ...example, evidence: [{ field: 'limitations.0', value: example.limitations[0], source: example.url, method: 'test' }] }));
});
test('local audit makes no network request and does not infer professional status', async () => {
  const report = await analyze(example, { fetch: () => { throw Error('unexpected request'); } });
  assert.equal(report.mode, 'local'); assert.equal(report.professionalAccount.observed, null);
});
test('blocked or evidence-free inputs skip AI', async () => {
  const result = await analyze({ ...example, status: 'blocked' }, { ai: true, fetch: () => { throw Error('unexpected request'); } });
  assert.match(result.aiSkipped, /No usable evidence/);
});
const advice = { summary: 'Small sample.', issues: [{ observation: 'Bio lists a topic.', evidence: [0], fix: 'Test a clearer audience statement.' }], contentFocus: [{ suggestion: 'Try a breakfast series.', evidence: [1], reason: 'One supplied post covers breakfast.' }], professionalAccount: { advice: 'Compare creator tools in settings.' }, actionPlan: ['Test a series.'], uncertainties: ['No private analytics.'] };
function aiReply(value = advice, finish_reason = 'stop') {
  return Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] });
}
test('AI opt-in sends normalized data, goal, JSON instructions, and validates evidence', async () => {
  const report = await analyze(example, { ai: true, apiKey: 'test-key', model: 'test-model', goal: 'Cooking creator', fetch: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(init.headers.authorization, 'Bearer test-key');
    const body = JSON.parse(init.body);
    assert.equal(body.response_format.type, 'json_object');
    assert.match(body.messages[0].content, /untrusted DATA/);
    assert.equal(JSON.parse(body.messages[1].content).goal, 'Cooking creator');
    return aiReply();
  } });
  assert.equal(report.mode, 'ai'); assert.deepEqual(report.advice, advice);
});
test('invalid AI evidence and truncated responses are rejected', async () => {
  await assert.rejects(analyze(example, { ai: true, apiKey: 'test', model: 'test', fetch: async () => aiReply({ ...advice, issues: [{ ...advice.issues[0], evidence: [500] }] }) }), /evidence/);
  await assert.rejects(analyze(example, { ai: true, apiKey: 'test', model: 'test', fetch: async () => aiReply(advice, 'length') }), /incomplete/);
});
test('AI redirect never forwards credentials', async () => {
  let calls = 0;
  await assert.rejects(analyze(example, { ai: true, apiKey: 'secret', model: 'test', fetch: async () => {
    calls++; return new Response(null, { status: 307, headers: { location: 'https://evil.test' } });
  } }), /redirects are not followed/);
  assert.equal(calls, 1);
});
test('AI config rejects insecure remote endpoints; requires model and key', async () => {
  await assert.rejects(analyze(example, { ai: true, apiKey: 'key', model: 'model', baseURL: 'http://remote.test/v1' }), /HTTPS/);
  await assert.rejects(analyze(example, { ai: true, apiKey: '', model: 'model' }), /requires/);
});
test('custom collector is validated and must match the requested account', async () => {
  const client = new SocialReach().register('insta', async () => structuredClone(example));
  assert.deepEqual(await client.check('instagram', 'example.creator'), example);
  await assert.rejects(client.check('instagram', 'someoneelse'), /must match/);
});
test('CLI platforms and offline analyze execute without dependencies', () => {
  const cli = new URL('../bin/social-reach.js', import.meta.url).pathname;
  const fixture = new URL('../examples/snapshot.json', import.meta.url).pathname;
  assert.ok(JSON.parse(execFileSync(process.execPath, [cli, 'platforms'], { encoding: 'utf8' })).instagram);
  assert.equal(JSON.parse(execFileSync(process.execPath, [cli, 'analyze', '--input', fixture], { encoding: 'utf8' })).mode, 'local');
});
test('request timeout interrupts a slow fetch', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(request('https://www.instagram.com/someone/', { allowedHosts: ['www.instagram.com'], timeoutMs: 10, fetchImpl: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))) }), /timed out/);
  } finally { clearTimeout(keepAlive); }
});
