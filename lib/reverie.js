import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export const P = 'reverie';

export const K = {
  core: `${P}:core`,
  aboutKk: `${P}:about_kk`,
  memo: `${P}:memo`,
  daily: (ts) => `${P}:daily:${ts}`,
  diary: (ts) => `${P}:diary:${ts}`,
  writing: (project) => `${P}:writing:${encodeURIComponent(project)}`,
  health: (ts) => `${P}:health:${ts}`,
  channel: (name) => `${P}:channel:${encodeURIComponent(name)}`,
  message: (ts) => `${P}:message:${ts}`,
  transcript: (ts) => `${P}:transcript:${ts}`,
};

export const now = () => Date.now();

export const fmtTime = (ts) => {
  const d = new Date(ts);
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().replace('T', ' ').slice(0, 19);
};

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
