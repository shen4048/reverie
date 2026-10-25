import { Redis } from '@upstash/redis';
import { timingSafeEqual } from 'node:crypto';

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

export function setCors(res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
}

// ============ 鉴权 ============
// 密钥放在 Vercel 环境变量 REVERIE_KEY。没设密钥时一律拒绝(宁可连不上也不裸奔)。
// 接受三种传法:路径 /k/<密钥>/mcp(给 claude.ai 连接器用)、Authorization: Bearer <密钥>、X-Api-Key: <密钥>(给网页用)。
function sameKey(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkKey(req) {
  const expected = process.env.REVERIE_KEY;
  if (!expected || expected.length < 16) return false;
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const given = req.query?.key || bearer || req.headers['x-api-key'] || '';
  return given !== '' && sameKey(given, expected);
}

export function deny(res) {
  return res.status(401).json({ error: 'unauthorized' });
}
