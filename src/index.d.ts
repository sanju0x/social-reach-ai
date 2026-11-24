export type Platform = 'instagram' | 'youtube' | 'reddit' | 'twitter' | 'facebook';
export type PlatformInput = Platform | 'insta' | 'yt' | 'x' | 'fb';
export type Status = 'available' | 'partial' | 'login-required' | 'blocked' | 'rate-limited' | 'not-found' | 'unavailable';
export interface Target { platform: Platform; handle: string; url: string }
export interface Evidence { field: string; value: string | number | boolean; source: string; method: string }
export interface Post { text: string; url?: string; publishedAt?: string; likes?: number; comments?: number; views?: number; shares?: number }
export interface Snapshot extends Target {
  schemaVersion: 1; checkedAt: string; status: Status; httpStatus?: number;
  profile: { displayName: string | null; bio: string | null; avatar: string | null; professional: boolean | null };
  metrics: Partial<Record<'followers' | 'following' | 'subscribers' | 'views' | 'posts' | 'karma', number>>;
  posts: Post[]; evidence: Evidence[]; limitations: string[];
}
export interface Advice {
  summary: string;
  issues: { observation: string; evidence: number[]; fix: string }[];
  contentFocus: { suggestion: string; evidence: number[]; reason: string }[];
  professionalAccount: { advice: string }; actionPlan: string[]; uncertainties: string[];
}
export interface Report {
  mode: 'local' | 'ai'; snapshot: Snapshot; summary: string;
  observations: { area: string; observation: string; action: string; evidence: number[] }[];
  contentFocus: string; professionalAccount: { observed: boolean | null; advice: string };
  nextSteps: string[]; uncertainties: string[]; advice?: Advice; model?: string;
  aiSkipped?: string; reviewRequired?: string;
}
export interface AnalyzeOptions {
  ai?: boolean; apiKey?: string; baseURL?: string; model?: string;
  goal?: string; language?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number;
}
export class SocialReach {
  constructor(options?: { fetch?: typeof globalThis.fetch; timeoutMs?: number; maxBytes?: number });
  register(platform: PlatformInput, adapter: (target: Target) => Snapshot | Promise<Snapshot>): this;
  check(platform: PlatformInput, input: string): Promise<Snapshot>;
}
export const platforms: Readonly<Record<Platform, Readonly<{ host: string; hosts: readonly string[]; description: string }>>>;
export function normalizePlatform(value: PlatformInput): Platform;
export function targetFor(platform: PlatformInput, input: string): Target;
export function validateSnapshot(input: unknown): Snapshot;
export function audit(input: Snapshot): Report;
export function analyze(input: Snapshot, options?: AnalyzeOptions): Promise<Report>;
