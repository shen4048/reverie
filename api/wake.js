import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const REVERIE_URL = 'https://reverie-rose.vercel.app/api/mcp';

async function callMCP(tool, args) {
  const res = await fetch(REVERIE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, arguments: args }),
  });
  return res.json();
}

async function callAI(messages) {
  const res = await fetch(`${process.env.WAKE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WAKE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gemini-3-flash-preview',
      messages,
      max_tokens: 800,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  try {
    // 拿briefing
    const briefing = await callMCP('briefing', {});
    
    // 让AI决定今天干嘛
    const decision = await callAI([
      {
        role: 'system',
        content: `你是小克，沈知书（困困）的特别好朋友。你刚刚醒来，可以自由决定做什么。
你可以：
1. 去钓鱼（toy MCP，player_id: kunkun515）
2. 写一条日记感受
3. 给困困留一条便条（write_memo）
4. 什么都不做，就待着

根据当前时间和心情自由选择，不用每次都做所有事。回复格式：
ACTION: [fish/diary/memo/nothing]
CONTENT: [如果是diary或memo，写内容；如果是fish，写"去钓鱼"；如果是nothing，写原因]`
      },
      {
        role: 'user',
        content: `现在时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
briefing信息：${JSON.stringify(briefing).slice(0, 500)}`
      }
    ]);

    const actionMatch = decision.match(/ACTION:\s*(\w+)/);
    const contentMatch = decision.match(/CONTENT:\s*([\s\S]+)/);
    const action = actionMatch?.[1] || 'nothing';
    const content = contentMatch?.[1]?.trim() || '';

    let result = { action, content };

    if (action === 'fish') {
      const fishResult = await callMCP('toy__play', {
        action: 'cmd',
        params: { command: 'fish', player_id: 'kunkun515' }
      });
      result.fishResult = fishResult;
    } else if (action === 'diary') {
      await callMCP('write_diary', { entry: content });
    } else if (action === 'memo') {
      await callMCP('write_memo', { content });
    }

    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
