#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { SocialReach, platforms, analyze } from '../src/index.js';

const help = `social-reach — public profile checks and account advice

  social-reach platforms
  social-reach check <platform> <username-or-url>
  social-reach analyze <platform> <username-or-url> [--ai] [--goal "..."]
  social-reach analyze --input snapshot.json [--ai] [--language English]

Aliases: insta, yt, x, fb. All results are JSON.
Without --ai, analysis is local and free. --ai sends snapshot data to your configured
provider and may incur API charges. Set SOCIAL_REACH_API_KEY (or OPENAI_API_KEY)
and SOCIAL_REACH_MODEL. Optional SOCIAL_REACH_AI_BASE_URL for compatible providers.
No passwords, cookies, or platform login are used by the built-in collectors.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: { ai: { type: 'boolean' }, input: { type: 'string' }, goal: { type: 'string' }, language: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  const [command, platform, handle, ...extra] = positionals;
  if (values.help || !command) console.log(help);
  else if (command === 'platforms') {
    if (positionals.length !== 1 || Object.keys(values).length) throw new TypeError('platforms takes no arguments');
    console.log(JSON.stringify(platforms, null, 2));
  } else if (['check', 'analyze'].includes(command)) {
    if (extra.length || (values.input ? command !== 'analyze' || platform || handle : !platform || !handle)) throw new TypeError('Provide platform and username, or use analyze --input snapshot.json');
    if (command === 'check' && (values.ai || values.goal || values.language)) throw new TypeError('Use analyze for analysis options');
    let snapshot;
    if (values.input) {
      const file = await readFile(values.input);
      if (file.length > 1_000_000) throw new TypeError('Input file exceeds 1 MB');
      snapshot = JSON.parse(file.toString('utf8'));
    } else snapshot = await new SocialReach().check(platform, handle);
    const result = command === 'analyze' ? await analyze(snapshot, { ai: values.ai, goal: values.goal, language: values.language }) : snapshot;
    console.log(JSON.stringify(result, null, 2));
    if (!['available', 'partial'].includes(snapshot.status)) process.exitCode = 2;
  } else throw new TypeError(`Unknown command: ${command}. Use --help.`);
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
