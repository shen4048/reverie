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
  channel: (name) => `${P}:channel:${encodeURIComponent(name)}`,
  message: (ts) => `${P}:message:${ts}`,
  transcript: (ts) => `${P}:transcript:${ts}`,
  channelLevel: `${P}:channel_level`,
};

export const now = () => Date.now();

export const fmtTime = (ts) => {
  const d = new Date(ts);
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().replace('T', ' ').slice(0, 19);
};

// ============ 时间参数 ============
// 纯日期(2026-10-20)按北京时间理解:since 取当天 00:00,until 取当天 23:59:59.999。
// 纯数字当毫秒时间戳;其他格式交给 Date.parse。
const DATE_ONLY = /^\d{4}-\d{1,2}-\d{1,2}$/;

export function parseTimeArg(v, isUntil = false) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (DATE_ONLY.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const start = Date.UTC(y, m - 1, d) - 8 * 3600 * 1000;
    return isUntil ? start + 24 * 3600 * 1000 - 1 : start;
  }
  const t = Date.parse(s);
  if (isNaN(t)) throw new Error(`时间参数解析失败: ${v}`);
  return t;
}

export function filterByTime(entries, since, until) {
  const s = parseTimeArg(since);
  const u = parseTimeArg(until, true);
  return entries.filter(e => (s === null || e.ts >= s) && (u === null || e.ts <= u));
}

// ============ daily 格式 ============
// 只修两种已出现的格式问题:长段落没有标题、【标题】与正文挤在一起。
export function normalizeDaily(content) {
  const bracketEnd = content.startsWith('【') ? content.indexOf('】') : -1;
  if (bracketEnd >= 0) {
    const rest = content.slice(bracketEnd + 1);
    return rest.trim() && !rest.startsWith('\n---\n')
      ? `${content.slice(0, bracketEnd + 1)}\n---\n${rest}`
      : content;
  }
  const title = content.includes('\n---\n') ? content.split('\n---\n')[0] : content.split('\n')[0];
  return [...title].length > 40 ? `无标题\n---\n${content}` : content;
}

export function dailyBody(content) {
  const parts = content.split('\n---\n');
  return (parts.length > 1 ? parts.slice(1).join('\n---\n') : content.split('\n').slice(1).join('\n')).trim();
}

// ============ 原样替换 ============
// 不用 String.replace(新内容里的 $& $1 会被吃掉);原文片段必须恰好出现一次。
export function replaceOnce(text, match, content, where = '') {
  const first = text.indexOf(match);
  if (first === -1) throw new Error(`${where}找不到要替换的原文片段: ${match.slice(0, 40)}...`);
  if (text.indexOf(match, first + 1) !== -1) {
    throw new Error(`${where}要替换的原文片段出现了不止一次,请给更长、更唯一的片段: ${match.slice(0, 40)}...`);
  }
  return text.slice(0, first) + content + text.slice(first + match.length);
}

// ============ 读一整层 ============
export async function mgetEntries(layer) {
  const keys = await redis.keys(`${P}:${layer}:*`);
  if (!keys || keys.length === 0) return [];
  const values = await redis.mget(...keys);
  const entries = [];
  for (let i = 0; i < keys.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const ts = parseInt(keys[i].split(':').pop(), 10);
    if (isNaN(ts)) continue;
    entries.push({ ts, id: ts, key: keys[i], content: typeof v === 'string' ? v : JSON.stringify(v) });
  }
  return entries;
}

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
