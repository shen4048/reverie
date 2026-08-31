import { redis, K, fmtTime } from '../lib/reverie.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function extractConventions(content) {
  const conventions = [];
  const regex = /【约定】([^\n【]*(?:\n(?!【)[^\n【]*)*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text) conventions.push(`【约定】${text}`);
  }
  return conventions;
}

function isTemporary(text) {
  return /今天|本次|这次|这轮|今晚|当天|当次|本轮/.test(text);
}

async function syncConventions(content) {
  const conventions = extractConventions(content);
  if (conventions.length === 0) return;
  const core = conventions.filter(c => !isTemporary(c));
  if (core.length === 0) return;
  const channelKey = K.channel('约定');
  const cur = (await redis.get(channelKey)) || '';
  const toAdd = core.filter(c => !cur.includes(c));
  if (toAdd.length === 0) return;
  const merged = cur ? `${cur}\n\n${toAdd.join('\n\n')}` : toAdd.join('\n\n');
  await redis.set(channelKey, merged);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type } = req.query;
  const body = req.body;

  try {
    if (type === 'daily') {
      const { id, content } = body;
      if (!id || !content) return res.status(400).json({ error: 'id 和 content 必填' });
      const key = `reverie:daily:${id}`;
      const v = await redis.get(key);
      if (!v) return res.status(404).json({ error: '找不到该条目' });
      const entry = `[${fmtTime(parseInt(id, 10))}] ${content}`;
      await redis.set(key, entry);
      await syncConventions(content);
      return res.status(200).json({ ok: true });
    }

    if (type === 'channel') {
      const { channel, content } = body;
      if (!channel || content === undefined) return res.status(400).json({ error: 'channel 和 content 必填' });
      const key = `reverie:channel:${encodeURIComponent(channel)}`;
      await redis.set(key, content);
      return res.status(200).json({ ok: true });
    }

    if (type === 'delete_channel') {
      const { channel } = body;
      if (!channel) return res.status(400).json({ error: 'channel 必填' });
      const key = `reverie:channel:${encodeURIComponent(channel)}`;
      await redis.del(key);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'type参数必须是 daily/channel/delete_channel' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
