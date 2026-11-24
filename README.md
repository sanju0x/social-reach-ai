# social-reach-ai

A JavaScript npm package and CLI for public social profile metadata checks and optional AI advice. Node.js 20+, ESM, TypeScript declarations, no runtime dependencies.

Built around the public-access idea discussed for [Agent-Reach](https://github.com/Panniantong/Agent-Reach), with an independent JavaScript implementation. This is not an official port, fork, or affiliated package. No upstream source was copied.

**This release is a metadata collector and analysis foundation, not a complete social analytics service.** Instagram, YouTube, Reddit, X/Twitter, and Facebook have built-in profile URL handling and static HTML metadata extraction. They can return login walls, blocked responses, or empty app shells. No guaranteed no-login access, post scraping, search, private analytics, account diagnosis, or platform authentication is implemented. AI uses visible bio metadata or data you supply; detailed content recommendations need a representative post sample.

## Install from GitHub

Install directly from this public repository. The npm name is provisional; registry availability has not been checked and this package has not been published to npm.

```bash
npm install github:sanju0x/social-reach-ai
npx social-reach platforms
npx social-reach check instagram username
npx social-reach check youtube @channel
npx social-reach check reddit username
npx social-reach check twitter username
npx social-reach check facebook page.name
npx social-reach analyze instagram username
```

To run the source directly:

```bash
git clone https://github.com/sanju0x/social-reach-ai.git
cd social-reach-ai
node bin/social-reach.js platforms
node bin/social-reach.js analyze --input examples/snapshot.json
npm test
```

All CLI output is JSON. Exit codes: `0` usable metadata or successful offline analysis, `1` invalid input/provider failure, `2` profile collection returned no usable data. `partial` means metadata was found, not verified account existence or a complete account audit. `not-found` means HTTP 404, not confirmed account deletion.

Aliases: `insta`, `yt`, `x`, `fb`. Profile URLs are accepted for the selected platform. Facebook numeric usernames work; `profile.php?id=...`, post URLs, search URLs, and video URLs are intentionally unsupported. YouTube accepts handles and `/channel/UC...` URLs. Explicit HTTPS profile URLs are required when supplying URLs.

## AI analysis

Use a provider/model supporting the OpenAI-compatible Chat Completions endpoint and JSON object mode. API billing is separate from a ChatGPT subscription. No model is silently selected.

```bash
export SOCIAL_REACH_API_KEY="your-provider-key"
export SOCIAL_REACH_MODEL="your-provider-model-id"
# Optional; defaults to https://api.openai.com/v1
# export SOCIAL_REACH_AI_BASE_URL="https://your-provider.example/v1"

npx social-reach analyze instagram username --ai --goal "Grow a cooking creator profile" --language English
npx social-reach analyze --input examples/snapshot.json --ai
```

`OPENAI_API_KEY` is accepted as a fallback. Local OpenAI-compatible servers can use `http://localhost:PORT/v1` and a dummy API key if the server requires none. Other HTTP endpoints are rejected. Base URLs end at `/v1` (or the provider's API prefix); the package appends `/chat/completions`. Provider redirects are rejected to avoid forwarding credentials. Providers must return `finish_reason: "stop"` and the documented JSON structure.

With `--ai`, the normalized profile, supplied posts/metrics, evidence, limitations, goal, and language are sent to that provider. No raw HTML is sent. Avoid including secrets or unnecessary personal information in snapshots. No AI request is made when collection has failed or evidence is empty. Without `--ai`, analysis is local and makes no AI request.

AI advice contains:

- `issues`: observed profile/content concerns, supporting evidence indexes, and proposed fixes.
- `contentFocus`: topic/content experiments grounded in supplied bio or post evidence.
- `professionalAccount`: conditional creator/business tooling advice.
- `actionPlan`: practical next steps.
- `uncertainties`: missing information and limits.

The full report retains the original snapshot and a local audit. `advice` is present only when AI runs. Evidence references are zero-based indexes into `snapshot.evidence`. Evidence matching and output validation prevent malformed references; they do not prove the model's interpretation. Review suggestions against their sources. No automated account changes are made.

## JavaScript API

```js
import { SocialReach, analyze } from 'social-reach-ai';

const client = new SocialReach({ timeoutMs: 15000, maxBytes: 2_000_000 });
const snapshot = await client.check('instagram', 'username');
const localReport = await analyze(snapshot);

const aiReport = await analyze(snapshot, {
  ai: true,
  apiKey: process.env.SOCIAL_REACH_API_KEY,
  model: process.env.SOCIAL_REACH_MODEL,
  goal: 'Make my profile clearer and plan useful content',
  language: 'English'
});
console.log(aiReport);
```

Exports: `SocialReach`, `platforms`, `normalizePlatform`, `targetFor`, `validateSnapshot`, `audit`, `analyze`. Both collector and analyzer accept an injected `fetch` for integrations and testing. Custom fetch implementations must honor the supplied abort signal and return standard `Response` objects.

## Current public collection capabilities

| Platform | Built-in collection | Important limits |
| --- | --- | --- |
| Instagram | Public HTML title, description, image | Often login-gated; no built-in post or follower extraction |
| YouTube | Public channel HTML title, description, image | No video/transcript extraction, subscriber counts, retention, or policy status |
| Reddit | Public profile HTML metadata if served | No anonymous `.json` Data API calls; blocked pages are reported |
| X / Twitter | Public HTML metadata if served | Login walls and app shells frequently yield no data |
| Facebook | Public profile/Page HTML metadata if served | Login walls common; no professional mode or insights detection |

Collection statuses: `partial`, `login-required`, `blocked`, `rate-limited`, `not-found`, `unavailable`. `available` is reserved for richer custom collectors/imports. Built-in collectors always leave `professional: null`, `metrics: {}`, and `posts: []`. Missing data means unknown, not zero or a missing feature on the account. A blocked collector does not mean the account is blocked.

## Supply your own no-login collector

Register your public-data logic per platform. A collector returns the normalized snapshot schema and provenance for every field used as evidence. It can be read-only, public-data logic or your own authorized API integration. The built-in package does not log in, load browser cookies, solve challenges, rotate proxies, or bypass access controls.

```js
import { SocialReach, analyze } from 'social-reach-ai';

const client = new SocialReach();
client.register('instagram', async target => {
  // Implement your logic in your application. This function is not bundled:
  const data = await yourPublicProfileLogic(target.handle);
  return {
    schemaVersion: 1,
    ...target,
    checkedAt: new Date().toISOString(),
    status: 'partial',
    profile: { displayName: data.name ?? null, bio: data.bio ?? null, avatar: null, professional: null },
    metrics: {},
    posts: [],
    evidence: data.bio == null ? [] : [{
      field: 'profile.bio', value: data.bio,
      source: target.url, method: 'custom-public-collector'
    }],
    limitations: ['Public fields only; account health is unknown.']
  };
});
console.log(await analyze(await client.check('instagram', 'username')));
```

Collector errors propagate to the caller; adapters own their own network controls. Returned platform, handle, and canonical URL must match the requested account. Custom collectors are trusted code; use only implementations you control.

## Imported data and schema

`examples/snapshot.json` is a working, explicitly fictional example. Replace it with data you own or have permission to use. Required top-level fields are `schemaVersion: 1`, canonical `platform`, `handle`, `url`, ISO `checkedAt`, `status`, `profile`, `metrics`, `posts`, `evidence`, and `limitations`.

Required profile fields: nullable strings `displayName`, `bio`, `avatar` (HTTPS URL or null), and `professional` (boolean or null). Professional status should be evidence-backed; otherwise the report treats it as unknown.

Optional metrics: nonnegative numbers `followers`, `following`, `subscribers`, `views`, `posts`, `karma`. Up to 50 posts support `text`, optional HTTPS `url`, `publishedAt`, `likes`, `comments`, `views`, `shares`. Up to 100 evidence entries support `field`, `value`, HTTPS `source`, and `method`. Field paths include `profile.bio`, `profile.professional`, `metrics.followers`, and `posts.0.text`. Evidence values must equal their normalized fields. Use explicit methods such as `owner-export`, `authorized-api`, or `custom-public-collector`; imported provenance is supplied by you, not independently authenticated.

AI payloads are limited to 60,000 characters. Input files are limited to 1 MB; public responses default to 2 MB; AI responses to 100 KB. No automatic retries, crawling, or local data persistence. Public fetches follow at most three redirects inside the selected platform's host allowlist. Challenge and consent responses stop collection.

## Reference repository platform comparison

The upstream project's README reviewed on November 24, 2026 lists the following channels. This package focuses on the five requested social profile platforms; other upstream channels are not implemented here.

| Upstream channel | Upstream access notes | This package |
| --- | --- | --- |
| Bilibili | Public features; subtitles need login | Not implemented |
| V2EX | Public | Not implemented |
| GitHub | Public | Not implemented |
| YouTube | Public; transcription needs a provider key | Channel metadata only |
| Web | Public search/read | Not implemented |
| Xiaohongshu | Login | Not implemented |
| Xueqiu | Quotes public; some feeds need login | Not implemented |
| Boss | Login | Not implemented |
| Xiaoyuzhou | Transcription needs a provider key | Not implemented |
| LinkedIn | Public jobs; internal search needs login | Not implemented |
| Reddit | Upstream login | Best-effort public HTML only |
| Twitter | Upstream login / experimental | Best-effort public HTML only |
| Facebook | Upstream login / experimental | Best-effort public HTML only |
| Instagram | Upstream login / experimental | Best-effort public HTML only |

Reddit's current official guidance says unauthenticated Data API traffic is blocked. Public profile collection is therefore deliberately separate from the Reddit Data API. Public visibility does not guarantee automated access; platform behavior can change.

## Verification and release

```bash
npm test
npm pack
```

Tests use deterministic synthetic HTTP fixtures and a mocked AI provider. They verify profile normalization, all five metadata collectors, unavailable/login/blocked/rate-limit behavior, evidence validation, network limits, credential-safe redirects, CLI behavior, and AI response validation. They do not certify live platform availability or real model quality. No paid provider request is needed for tests.

To release, choose an available npm name (or an owned scope) in `package.json`, set the desired version and maintainer metadata, then authenticate locally with npm and run `npm publish --access public`. Do not put npm tokens in source or chat.

## Sources

- [Agent-Reach README and supported platforms](https://github.com/Panniantong/Agent-Reach)
- [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)
- [YouTube channel API and authorized audit details](https://developers.google.com/youtube/v3/docs/channels/list)
- [OpenAI-compatible Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

MIT licensed.
