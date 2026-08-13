import { redis, K, fmtTime } from '../lib/reverie.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function mgetEntries(layer) {
  const keys = await redis.keys(`reverie:${layer}:*`);
  if (!keys || keys.length === 0) return [];
  const values = await redis.mget(...keys);
  const entries = [];
  for (let i = 0; i < keys.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const parts = keys[i].split(':');
    const ts = parseInt(parts[parts.length - 1], 10);
    if (isNaN(ts)) continue;
    const content = typeof v === 'string' ? v : JSON.stringify(v);
    entries.push({ ts, content, id: ts });
  }
  return entries;
}

function parseDaily(content) {
  if (!content) return { title: '', detail: '' };
  const withoutTs = content.replace(/^\[.*?\]\s*/, '');
  if (content.includes('\n---\n')) {
    const parts = content.split('\n---\n');
    const firstLine = (parts[0] || '').replace(/^\[.*?\]\s*/, '').trim();
    const detail = parts.slice(1).join('\n---\n').trim();
    return { title: firstLine, detail };
  } else {
    const lines = withoutTs.split('\n');
    const title = (lines[0] || '').trim();
    const detail = lines.slice(1).join('\n').trim();
    return { title, detail };
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { type, limit, since, until, channel } = req.query;

  try {
    if (type === 'diary') {
      let entries = await mgetEntries('diary');
      if (since) entries = entries.filter(e => e.ts >= parseInt(since));
      if (until) entries = entries.filter(e => e.ts <= parseInt(until));
      entries.sort((a, b) => b.ts - a.ts);
      const top = limit ? entries.slice(0, parseInt(limit)) : entries;
      return res.status(200).json(top.map(e => ({
        id: e.id,
        date: fmtTime(e.ts).slice(0, 10),
        content: e.content,
      })));
    }

    if (type === 'daily') {
      let entries = await mgetEntries('daily');
      if (since) entries = entries.filter(e => e.ts >= parseInt(since));
      if (until) entries = entries.filter(e => e.ts <= parseInt(until));
      entries.sort((a, b) => b.ts - a.ts);
      const top = limit ? entries.slice(0, parseInt(limit)) : entries;
      return res.status(200).json(top.map(e => {
        const { title, detail } = parseDaily(e.content);
        return { id: e.id, date: fmtTime(e.ts).slice(0, 10), title, detail };
      }));
    }

    if (type === 'channels') {
      const keys = await redis.keys('reverie:channel:*');
      const names = (keys || []).map(k => decodeURIComponent(k.replace('reverie:channel:', '')));
      if (!channel) {
        return res.status(200).json({ channels: names });
      }
      const v = await redis.get(`reverie:channel:${encodeURIComponent(channel)}`);
      return res.status(200).json({ name: channel, content: v || '' });
    }

    if (type === 'core') {
      const [core, aboutKk] = await Promise.all([
        redis.get(K.core),
        redis.get(K.aboutKk),
      ]);
      return res.status(200).json({ core: core || '', aboutKk: aboutKk || '' });
    }

    return res.status(400).json({ error: 'type参数必须是 diary/daily/channels/core' });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
