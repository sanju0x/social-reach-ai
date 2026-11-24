import { SocialReach, analyze } from 'social-reach-ai';

const client = new SocialReach();
const snapshot = await client.check('instagram', 'example.creator');
console.log(await analyze(snapshot));
// Explicitly opt in to sending collected data to an AI provider:
// console.log(await analyze(snapshot, {
//   ai: true,
//   model: process.env.SOCIAL_REACH_MODEL,
//   goal: 'Build a clear cooking creator profile',
//   language: 'English'
// }));
