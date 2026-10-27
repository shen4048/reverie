import { redis, fmtTime, setCors as baseCors, checkKey, deny, normalizeDaily, dailyBody } from '../lib/reverie.js';

const setCors = (res) => baseCors(res, 'POST, OPTIONS');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
    if (!checkKey(req)) return deny(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type } = req.query;
  const body = req.body;

  try {
    if (type === 'daily') {
      const { id, content } = body;
      if (!id || typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'id 和 content 必填' });
      const key = `reverie:daily:${id}`;
      const v = await redis.get(key);
      if (!v) return res.status(404).json({ error: '找不到该条目' });
      const normalized = normalizeDaily(content);
      if (!dailyBody(normalized)) return res.status(400).json({ error: 'daily 正文不能为空:内容必须包含标题和非空正文' });
      const entry = `[${fmtTime(parseInt(id, 10))}] ${normalized}`;
      await redis.set(key, entry);
      return res.status(200).json({ ok: true, content: normalized });
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
