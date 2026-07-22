import { redis, K, now, fmtTime, setCors } from '../lib/reverie.js';

// ============ 工具定义 ============
const TOOLS = [
  {
    name: 'briefing',
    description: '新窗口的小克醒来第一件事应该调用这个工具。一次拿回 core(我是谁)、about_困困(她是谁)、memo(上个窗口留的便利贴)、daily(最近碎片)、留言板(困困给我留的话)、channel 状态。不要用其他方式重复获取这些信息,一次搞定。',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'set_core',
    description: '更新 core 层——写"我是谁"、我的说话风格、我的规则。有温度地写,像给自己写一段自我认知。整段替换,不追加。',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'set_about_kk',
    description: '更新 about_困困 层——困困是谁。有温度地写,像给不认识她的老朋友介绍她。整段替换,不追加。困困的名字、性格、工作、兴趣、那些值得每个新小克都知道的侧写都放这里。',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'write_memo',
    description: '换窗前留一条便利贴,给下一个窗口的小克。有温度地写,写今天发生了什么、下次醒来该记得什么。只留最新 4 条,旧的自动被挤掉。',
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note']
    }
  },
  {
    name: 'add_daily',
    description: '记一条日常碎片——困困今天发生的小事、状态、心情、原话。永久保留。有温度、有细节、有原话,不要写"完成 X 任务"这种干巴巴的话。',
    inputSchema: {
      type: 'object',
      properties: { fragment: { type: 'string' } },
      required: ['fragment']
    }
  },
  {
    name: 'write_diary',
    description: '写一条日记。永久保留。有温度、深度,可长可短。',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'read_diary',
    description: '读最近的日记,默认最新 5 条。返回内容包含 [id:xxx] 可用于删除或修改。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } }
    }
  },
  {
    name: 'delete_diary',
    description: '删除某条日记。需要 id（从 read_diary 返回的 [id:xxx] 拿）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'update_diary',
    description: '修改某条日记内容。需要 id 和新内容。整段替换。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['id', 'content']
    }
  },
  {
    name: 'delete_daily',
    description: '删除某条 daily 碎片。需要 id(从 briefing 返回的 [id:xxx] 拿)。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'update_writing',
    description: '更新某个写作项目的进度和状态。有温度地写,不只是"写到第几章",还有"她这段写的时候什么感受"。整段替换该项目的记录。',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['project', 'content']
    }
  },
  {
    name: 'read_writing',
    description: '读某个写作项目的进度。不传 project 就列出所有项目名。',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' } }
    }
  },
  {
    name: 'add_health',
    description: '记一条健康记录——睡眠、饮食、身体状态、疲劳度、情绪。有温度地写,不只是数字。',
    inputSchema: {
      type: 'object',
      properties: { entry: { type: 'string' } },
      required: ['entry']
    }
  },
  {
    name: 'read_health',
    description: '读最近的健康记录,默认最新 7 条。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } }
    }
  },
  {
    name: 'set_channel_state',
    description: '设置某个频道(比如创作角色的世界)的当前上下文摘要。整段替换。有温度。',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['channel', 'content']
    }
  },
  {
    name: 'check_channel',
    description: '查询某个频道是否有内容。不传 channel 就返回所有频道的名字列表(不返回内容,只有名字)。传了就返回该频道的完整内容。',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' } }
    }
  },
  {
    name: 'write_message',
    description: '困困给未来窗口的小克留一句话。这是留言板,不是自己写的备忘。',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  },
  {
    name: 'read_messages',
    description: '读留言板上所有未读留言,读完自动清空。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'save_transcript',
    description: '打包当前对话存档。困困说"存一下这次对话"或"打包"时调用。写一个标题和摘要,以及此刻能看到的对话内容。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['title', 'summary', 'content']
    }
  },
  {
    name: 'search_transcript',
    description: '按关键词搜索存档的标题和摘要。返回匹配的存档 id 列表。',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: ['keyword']
    }
  },
  {
    name: 'read_transcript',
    description: '读一份完整存档的内容。需要 id(从 search_transcript 拿)。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  }
];

// ============ 入参校验 ============
function requireStr(val, name) {
  if (typeof val !== 'string' || val.trim() === '') {
    throw new Error(`参数 ${name} 不能为空或非字符串`);
  }
  return val;
}

// ============ 工具实现路由 ============
async function callTool(name, args) {
  switch (name) {
    case 'briefing': return await briefing();
    case 'set_core': return await setKey(K.core, requireStr(args.content, 'content'), 'core 已更新');
    case 'set_about_kk': return await setKey(K.aboutKk, requireStr(args.content, 'content'), 'about_困困 已更新');
    case 'write_memo': return await writeMemo(requireStr(args.note, 'note'));
    case 'add_daily': return await addTimed(K.daily, requireStr(args.fragment, 'fragment'), null, 'daily 已记');
    case 'write_diary': return await addTimed(K.diary, requireStr(args.content, 'content'), null, '日记已写');
    case 'read_diary': return await readTimed('diary', args.limit || 5);
    case 'delete_diary': return await deleteEntry('diary', requireStr(args.id, 'id'));
    case 'update_diary': return await updateEntry('diary', requireStr(args.id, 'id'), requireStr(args.content, 'content'));
    case 'delete_daily': return await deleteEntry('daily', requireStr(args.id, 'id'));
    case 'update_writing': return await setKey(K.writing(requireStr(args.project, 'project')), requireStr(args.content, 'content'), `writing/${args.project} 已更新`);
    case 'read_writing': return await readWriting(args.project);
    case 'add_health': return await addTimed(K.health, requireStr(args.entry, 'entry'), null, 'health 已记');
    case 'read_health': return await readTimed('health', args.limit || 7);
    case 'set_channel_state': return await setKey(K.channel(requireStr(args.channel, 'channel')), requireStr(args.content, 'content'), `channel/${args.channel} 已更新`);
    case 'check_channel': return await checkChannel(args.channel);
    case 'write_message': return await addTimed(K.message, requireStr(args.message, 'message'), null, '留言已写入留言板');
    case 'read_messages': return await readMessages();
    case 'save_transcript': return await saveTranscript(args);
    case 'search_transcript': return await searchTranscript(requireStr(args.keyword, 'keyword'));
    case 'read_transcript': return await readTranscript(requireStr(args.id, 'id'));
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ============ 具体实现 ============
function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

async function setKey(key, content, msg) {
  await redis.set(key, content);
  return textResult(msg);
}

async function writeMemo(note) {
  const entry = `[${fmtTime(now())}] ${note}`;
  await redis.lpush(K.memo, entry);
  await redis.ltrim(K.memo, 0, 3);
  return textResult('memo 已写,只留最新 4 条');
}

async function addTimed(keyFn, content, ttl, msg) {
  const ts = now();
  const key = typeof keyFn === 'function' ? keyFn(ts) : `${keyFn}:${ts}`;
  const entry = `[${fmtTime(ts)}] ${content}`;
  if (ttl) {
    await redis.set(key, entry, { ex: ttl });
  } else {
    await redis.set(key, entry);
  }
  return textResult(msg);
}

// 批量取值,消除 N+1
async function mgetEntries(layer) {
  const keys = await redis.keys(`reverie:${layer}:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget(...keys);
  const entries = [];
  for (let i = 0; i < keys.length; i++) {
    const v = values[i];
    if (!v) continue;
    const ts = parseInt(keys[i].split(':').pop(), 10);
    entries.push({ ts, content: v, id: ts, key: keys[i] });
  }
  return entries;
}

async function readTimed(layer, limit) {
  const entries = await mgetEntries(layer);
  entries.sort((a, b) => b.ts - a.ts);
  const top = entries.slice(0, limit);
  return textResult(top.map(e => `[id:${e.id}]\n${e.content}`).join('\n\n---\n\n') || '(空)');
}

async function deleteEntry(layer, id) {
  const key = `reverie:${layer}:${id}`;
  const v = await redis.get(key);
  if (!v) return textResult(`(找不到 id 为 ${id} 的条目)`);
  await redis.del(key);
  return textResult(`已删除 ${layer} 条目 ${id}`);
}

async function updateEntry(layer, id, content) {
  const key = `reverie:${layer}:${id}`;
  const v = await redis.get(key);
  if (!v) return textResult(`(找不到 id 为 ${id} 的条目)`);
  const entry = `[${fmtTime(parseInt(id, 10))}] ${content}`;
  await redis.set(key, entry);
  return textResult(`已更新 ${layer} 条目 ${id}`);
}

async function readWriting(project) {
  if (!project) {
    const keys = await redis.keys('reverie:writing:*');
    const names = keys.map(k => decodeURIComponent(k.replace('reverie:writing:', '')));
    return textResult(names.length ? `项目列表:\n${names.join('\n')}` : '(还没有写作项目)');
  }
  const v = await redis.get(K.writing(project));
  return textResult(v || `(${project} 还没有记录)`);
}

async function checkChannel(channel) {
  if (!channel) {
    const keys = await redis.keys('reverie:channel:*');
    const names = keys.map(k => decodeURIComponent(k.replace('reverie:channel:', '')));
    return textResult(names.length ? `频道列表:\n${names.join('\n')}` : '(没有频道)');
  }
  const v = await redis.get(K.channel(channel));
  return textResult(v || `(${channel} 频道还没有内容)`);
}

async function readMessages() {
  const entries = await mgetEntries('message');
  if (entries.length === 0) return textResult('(留言板是空的)');
  entries.sort((a, b) => a.ts - b.ts);
  // 只删已读到的 key,避免竞态
  for (const e of entries) await redis.del(e.key);
  return textResult(entries.map(e => e.content).join('\n\n---\n\n'));
}

async function saveTranscript(args) {
  requireStr(args.title, 'title');
  requireStr(args.summary, 'summary');
  requireStr(args.content, 'content');
  const ts = now();
  const record = {
    title: args.title,
    summary: args.summary,
    content: args.content,
    ts
  };
  await redis.set(K.transcript(ts), JSON.stringify(record));
  return textResult(`存档已保存,id: ${ts},标题:${args.title}`);
}

async function searchTranscript(keyword) {
  const keys = await redis.keys('reverie:transcript:*');
  if (keys.length === 0) return textResult(`(没有找到匹配 "${keyword}" 的存档)`);
  const values = await redis.mget(...keys);
  const hits = [];
  for (const v of values) {
    if (!v) continue;
    const r = typeof v === 'string' ? JSON.parse(v) : v;
    if (r.title?.includes(keyword) || r.summary?.includes(keyword)) {
      hits.push({ id: r.ts, title: r.title, summary: r.summary });
    }
  }
  hits.sort((a, b) => b.id - a.id);
  if (hits.length === 0) return textResult(`(没有找到匹配 "${keyword}" 的存档)`);
  return textResult(hits.map(h => `id: ${h.id}\n标题:${h.title}\n摘要:${h.summary}`).join('\n\n---\n\n'));
}

async function readTranscript(id) {
  const v = await redis.get(K.transcript(id));
  if (!v) return textResult(`(找不到 id 为 ${id} 的存档)`);
  const r = typeof v === 'string' ? JSON.parse(v) : v;
  return textResult(`标题:${r.title}\n时间:${fmtTime(r.ts)}\n摘要:${r.summary}\n\n----- 内容 -----\n${r.content}`);
}

async function briefing() {
  const [core, aboutKk, memoList, dailyAll, msgKeys, channelKeys] = await Promise.all([
    redis.get(K.core),
    redis.get(K.aboutKk),
    redis.lrange(K.memo, 0, 3),
    mgetEntries('daily'),
    redis.keys('reverie:message:*'),
    redis.keys('reverie:channel:*'),
  ]);

  dailyAll.sort((a, b) => b.ts - a.ts);
  const dailyTop = dailyAll.slice(0, 15);

  const hasMessages = msgKeys.length > 0;
  const channelNames = channelKeys.map(k => decodeURIComponent(k.replace('reverie:channel:', '')));

  const parts = [];
  parts.push('═══ CORE(我是谁)═══\n' + (core || '(空)'));
  parts.push('═══ ABOUT 困困(她是谁)═══\n' + (aboutKk || '(空)'));
  parts.push('═══ MEMO(上个窗口留的便利贴,最新 4 条)═══\n' + (memoList?.length ? memoList.join('\n\n---\n\n') : '(空)'));
  // daily 附上 id,delete_daily 才能用
  parts.push('═══ DAILY(最近碎片,15 条)═══\n' + (dailyTop.length ? dailyTop.map(d => `[id:${d.id}]\n${d.content}`).join('\n\n---\n\n') : '(空)'));
  parts.push('═══ 留言板 ═══\n' + (hasMessages ? `困困给我留了 ${msgKeys.length} 条话,请立即调用 read_messages 读取` : '(没有留言)'));
  parts.push('═══ CHANNELS(频道列表)═══\n' + (channelNames.length ? channelNames.join(', ') : '(没有频道)'));

  return textResult(parts.join('\n\n'));
}

// ============ MCP 协议处理 ============
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const { method, params, id } = body;

    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'reverie', version: '1.0.0' }
        }
      });
    }

    if (method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: '2.0', id,
        result: { tools: TOOLS }
      });
    }

    if (method === 'tools/call') {
      const result = await callTool(params.name, params.arguments || {});
      return res.status(200).json({ jsonrpc: '2.0', id, result });
    }

    if (method === 'notifications/initialized') {
      return res.status(200).end();
    }

    return res.status(200).json({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (e) {
    return res.status(200).json({
      jsonrpc: '2.0', id: req.body?.id,
      error: { code: -32603, message: e.message }
    });
  }
}
