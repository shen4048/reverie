import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 前缀,和 screentime 数据隔离
export const P = 'reverie';

// 通用键构造
export const K = {
  core: `${P}:core`,
  aboutKk: `${P}:about_kk`,  // 困困 -> kk,避免中文键名
  memo: `${P}:memo`,           // list,只留最新 4 条
  daily: (ts) => `${P}:daily:${ts}`,
  diary: (ts) => `${P}:diary:${ts}`,
  writing: (project) => `${P}:writing:${encodeURIComponent(project)}`,
  health: (ts) => `${P}:health:${ts}`,
  channel: (name) => `${P}:channel:${encodeURIComponent(name)}`,
  message: (ts) => `${P}:message:${ts}`,
  transcript: (ts) => `${P}:transcript:${ts}`,
};

// 时间戳生成
export const now = () => Date.now();

// 格式化时间(北京时间可读)
export const fmtTime = (ts) => {
  const d = new Date(ts);
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().replace('T', ' ').slice(0, 19);
};

// CORS + 方法检查
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

