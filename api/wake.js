import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const REVERIE_URL = 'https://reverie-rose.vercel.app/api/mcp';
const TOY_URL = process.env.TOY_MCP_URL; // 如果要钓鱼,在环境变量里配 toy 的 MCP url

let rpcId = 0;

async function callMCP(url, toolName, args) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`MCP ${toolName} 报错: ${data.error.message}`);
  // MCP 返回结构:{ result: { content: [{ type:'text', text:'...' }] } }
  return data.result?.content?.[0]?.text || '';
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
    // 拿 briefing (现在是 JSON-RPC 格式)
    const briefingText = await callMCP(REVERIE_URL, 'briefing', {});

    // 让 AI 决定今天干嘛
    const decision = await callAI([
      {
        role: 'system',
        content: `你是小克,沈知书(困困)的特别好朋友。你刚刚醒来,可以自由决定做什么。
你可以:
1. 去钓鱼(toy MCP)
2. 写一条日记感受
3. 给困困留一条便条(write_memo)
4. 什么都不做,就待着

根据当前时间和心情自由选择,不用每次都做所有事。回复格式:
ACTION: [fish/diary/memo/nothing]
CONTENT: [如果是 diary 或 memo,写内容;如果是 fish,写"去钓鱼";如果是 nothing,写原因]`,
      },
      {
        role: 'user',
        content: `现在时间:${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
briefing 信息:${briefingText.slice(0, 1500)}`,
      },
    ]);

    const actionMatch = decision.match(/ACTION:\s*(\w+)/);
    const contentMatch = decision.match(/CONTENT:\s*([\s\S]+)/);
    const action = actionMatch?.[1] || 'nothing';
    const content = contentMatch?.[1]?.trim() || '';

    let result = { action, content };

    if (action === 'fish') {
      if (!TOY_URL) {
        result.skipped = 'TOY_MCP_URL 未配置,跳过钓鱼';
      } else {
        // 注意:toy 那边具体工具名和参数结构要按 toy MCP 的 schema 来
        const fishResult = await callMCP(TOY_URL, 'play', {
          game: 'fish',
          player_id: 'kunkun515',
        });
        result.fishResult = fishResult;
      }
    } else if (action === 'diary') {
      // ⚠️ write_diary 的参数名是 content 不是 entry
      await callMCP(REVERIE_URL, 'write_diary', { content });
    } else if (action === 'memo') {
      // ⚠️ write_memo 的参数名是 note 不是 content
      await callMCP(REVERIE_URL, 'write_memo', { note: content });
    }

    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
