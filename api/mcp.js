import { redis, K, now, fmtTime, setCors } from '../lib/reverie.js';

// ============ 工具定义 ============
const TOOLS = [
  {
    name: 'briefing',
    description: '新窗口的小克醒来第一件事应该调用这个工具。一次拿回 core、about_困困、memo、daily(最近事件标题)、留言板、channel 状态。',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'set_core',
    description: '更新 core 层——我是谁、说话风格、规则。默认 replace 整段替换;mode=append 追加;mode=edit 替换某段(需要 match)。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'append', 'edit'] },
        match: { type: 'string', description: 'mode=edit 时必需,要被替换的原文片段' }
      },
      required: ['content']
    }
  },
  {
    name: 'set_about_kk',
    description: '更新 about_困困 层——困困是谁。默认 replace;mode=append 追加;mode=edit 替换某段(需要 match)。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'append', 'edit'] },
        match: { type: 'string' }
      },
      required: ['content']
    }
  },
  {
    name: 'write_memo',
    description: '换窗前留一条便利贴,只留最新 4 条。',
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note']
    }
  },
  {
    name: 'add_daily',
    description: '记一条流水账事件。这是"我们聊了什么"的索引,标题限 20 字以内的名词短语或"动词+对象",快速定位用,不写情绪不写细节。例:「修C盘」「讨论闹钟窗口机制」。规则:聊完一个小段就 add 一条,后续同话题的内容用 enrich_daily 追加,不要新开;混着聊多话题时就有多条并行开着。',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title']
    }
  },
  {
    name: 'enrich_daily',
    description: '给已有的 daily 追加细节。可多次调用,细节按顺序累积。补事件的具体经过、原话、情境。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['id', 'detail']
    }
  },
  {
    name: 'update_daily',
    description: '改错用。整条覆盖某条 daily 的完整内容。',
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
    name: 'read_daily',
    description: '读最近的 daily。默认 titles 模式只出标题,full 模式含细节。可用 since/until(时间戳 ms 或 YYYY-MM-DD) 按日期过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        mode: { type: 'string', enum: ['titles', 'full'] },
        since: { type: 'string' },
        until: { type: 'string' }
      }
    }
  },
  {
    name: 'delete_daily',
    description: '删除某条 daily。需要 id。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'write_diary',
    description: '写一条日记——反思、情感梳理、想通某件事。跟 daily(事件流水)不同,diary 是"想一想/消化情绪"。**必须包含至少一段困困的原话(用引号标出)**,不要全部用自己的话转述——转述容易走样。可长可短。永久保留。',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'read_diary',
    description: '读最近的日记,默认 5 条。可用 since/until 按日期过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        since: { type: 'string' },
        until: { type: 'string' }
      }
    }
  },
  {
    name: 'delete_diary',
    description: '删除某条日记。需要 id。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'update_diary',
    description: '修改某条日记内容。需要 id 和新内容,整段替换。',
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
    name: 'update_writing',
    description: '更新某个写作项目的进度。整段替换该项目的记录。',
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
    description: '记一条健康记录——睡眠、饮食、身体状态、疲劳度、情绪。',
    inputSchema: {
      type: 'object',
      properties: { entry: { type: 'string' } },
      required: ['entry']
    }
  },
  {
    name: 'read_health',
    description: '读最近的健康记录,默认 7 条。可用 since/until 按日期过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        since: { type: 'string' },
        until: { type: 'string' }
      }
    }
  },
  {
    name: 'set_channel_state',
    description: '设置某个频道的上下文摘要。默认 replace;mode=append 追加;mode=edit 替换某段(需要 match)。',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        content: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'append', 'edit'] },
        match: { type: 'string' }
      },
      required: ['channel', 'content']
    }
  },
  {
    name: 'check_channel',
    description: '查询频道内容。不传 channel 返回所有频道名列表;传了返回该频道完整内容。',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' } }
    }
  },
  {
    name: 'write_message',
    description: '困困给未来窗口的小克留一句话。',
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
    description: '打包当前对话存档。写标题、摘要、内容。',
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
    description: '按关键词搜索存档标题和摘要,返回匹配的 id 列表。',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: ['keyword']
    }
  },
  {
    name: 'read_transcript',
    description: '读一份完整存档。需要 id。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'search_memory',
    description: '全文关键词搜索,跨 diary/daily/health/transcript 多层。用于回忆某件事、找旧内容。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        layers: {
          type: 'array',
          items: { type: 'string' },
          description: '限定搜索的层,不传搜全部。可选:diary/daily/health/transcript'
        }
      },
      required: ['keyword']
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

function parseTimeArg(v) {
  if (!v) return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const t = Date.parse(v);
  if (isNaN(t)) throw new Error(`时间参数解析失败: ${v}`);
  return t;
}

// ============ 工具实现路由 ============
async function callTool(name, args) {
  switch (name) {
    case 'briefing': return await briefing();
    case 'set_core': return await setKeyPatch(K.core, args, 'core');
    case 'set_about_kk': return await setKeyPatch(K.aboutKk, args, 'about_困困');
    case 'write_memo': return await writeMemo(requireStr(args.note, 'note'));
    case 'add_daily': return await addDaily(requireStr(args.title, 'title'));
    case 'enrich_daily': return await enrichDaily(requireStr(args.id, 'id'), requireStr(args.detail, 'detail'));
    case 'update_daily': return await updateEntry('daily', requireStr(args.id, 'id'), requireStr(args.content, 'content'));
    case 'read_daily': return await readDaily(args.limit || 15, args.mode || 'titles', args.since, args.until);
    case 'delete_daily': return await deleteEntry('daily', requireStr(args.id, 'id'));
    case 'write_diary': return await addTimed(K.diary, requireStr(args.content, 'content'), null, '日记已写');
    case 'read_diary': return await readTimed('diary', args.limit || 5, args.since, args.until);
    case 'delete_diary': return await deleteEntry('diary', requireStr(args.id, 'id'));
    case 'update_diary': return await updateEntry('diary', requireStr(args.id, 'id'), requireStr(args.content, 'content'));
    case 'update_writing': return await setKey(K.writing(requireStr(args.project, 'project')), requireStr(args.content, 'content'), `writing/${args.project} 已更新`);
    case 'read_writing': return await readWriting(args.project);
    case 'add_health': return await addTimed(K.health, requireStr(args.entry, 'entry'), null, 'health 已记');
    case 'read_health': return await readTimed('health', args.limit || 7, args.since, args.until);
    case 'set_channel_state': return await setChannelPatch(requireStr(args.channel, 'channel'), args);
    case 'check_channel': return await checkChannel(args.channel);
    case 'write_message': return await addTimed(K.message, requireStr(args.message, 'message'), null, '留言已写入留言板');
    case 'read_messages': return await readMessages();
    case 'save_transcript': return await saveTranscript(args);
    case 'search_transcript': return await searchTranscript(requireStr(args.keyword, 'keyword'));
    case 'read_transcript': return await readTranscript(requireStr(args.id, 'id'));
    case 'search_memory': return await searchMemory(requireStr(args.keyword, 'keyword'), args.layers);
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

async function applyPatch(key, args, layerName) {
  const mode = args.mode || 'replace';
  const content = requireStr(args.content, 'content');
  if (mode === 'replace') {
    await redis.set(key, content);
    return `${layerName} 已整段替换`;
  }
  if (mode === 'append') {
    const cur = (await redis.get(key)) || '';
    const merged = cur ? `${cur}\n\n${content}` : content;
    await redis.set(key, merged);
    return `${layerName} 已追加一段`;
  }
  if (mode === 'edit') {
    const match = requireStr(args.match, 'match');
    const cur = await redis.get(key);
    if (!cur) throw new Error(`${layerName} 当前是空的,没法 edit`);
    if (!cur.includes(match)) throw new Error(`${layerName} 里找不到要替换的原文片段:${match.slice(0, 40)}...`);
    const merged = cur.replace(match, content);
    await redis.set(key, merged);
    return `${layerName} 已替换某段`;
  }
  throw new Error(`未知 mode: ${mode}`);
}

async function setKeyPatch(key, args, layerName) {
  const msg = await applyPatch(key, args, layerName);
  return textResult(msg);
}

async function setChannelPatch(channel, args) {
  const msg = await applyPatch(K.channel(channel), args, `channel/${channel}`);
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
  return textResult(`${msg},id: ${ts}`);
}

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

function filterByTime(entries, since, until) {
  const s = parseTimeArg(since);
  const u = parseTimeArg(until);
  return entries.filter(e => {
    if (s !== null && e.ts < s) return false;
    if (u !== null && e.ts > u) return false;
    return true;
  });
}

async function readTimed(layer, limit, since, until) {
  let entries = await mgetEntries(layer);
  entries = filterByTime(entries, since, until);
  entries.sort((a, b) => b.ts - a.ts);
  const top = entries.slice(0, limit);
  return textResult(top.map(e => `[id:${e.id}]\n${e.content}`).join('\n\n---\n\n') || '(空)');
}

// daily 存储:"[时间] 标题\n---\n细节1\n---\n细节2..."
async function addDaily(title) {
  const ts = now();
  const key = K.daily(ts);
  const entry = `[${fmtTime(ts)}] ${title}`;
  await redis.set(key, entry);
  return textResult(`daily 已记,id: ${ts},标题:${title}`);
}

async function enrichDaily(id, detail) {
  const key = K.daily(id);
  const cur = await redis.get(key);
  if (!cur) return textResult(`(找不到 id 为 ${id} 的 daily)`);
  const merged = `${cur}\n---\n${detail}`;
  await redis.set(key, merged);
  return textResult(`daily ${id} 已追加细节`);
}

async function readDaily(limit, mode, since, until) {
  let entries = await mgetEntries('daily');
  entries = filterByTime(entries, since, until);
  entries.sort((a, b) => b.ts - a.ts);
  const top = entries.slice(0, limit);
  if (top.length === 0) return textResult('(空)');
  const out = top.map(e => {
    if (mode === 'titles') {
      const title = e.content.split('\n---\n')[0];
      return `[id:${e.id}] ${title}`;
    }
    return `[id:${e.id}]\n${e.content}`;
  }).join('\n\n');
  return textResult(out);
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

async function searchMemory(keyword, layers) {
  const targets = (layers && layers.length ? layers : ['diary', 'daily', 'health', 'transcript'])
    .filter(l => ['diary', 'daily', 'health', 'transcript'].includes(l));
  const hits = [];
  for (const layer of targets) {
    const entries = await mgetEntries(layer);
    for (const e of entries) {
      let searchable = e.content;
      if (layer === 'transcript') {
        try {
          const r = typeof e.content === 'string' ? JSON.parse(e.content) : e.content;
          searchable = `${r.title || ''}\n${r.summary || ''}\n${r.content || ''}`;
        } catch { /* 兜底 */ }
      }
      if (searchable.includes(keyword)) {
        const idx = searchable.indexOf(keyword);
        const start = Math.max(0, idx - 30);
        const end = Math.min(searchable.length, idx + keyword.length + 30);
        const snippet = (start > 0 ? '...' : '') + searchable.slice(start, end).replace(/\n/g, ' ') + (end < searchable.length ? '...' : '');
        hits.push({ layer, id: e.id, ts: e.ts, snippet });
      }
    }
  }
  hits.sort((a, b) => b.ts - a.ts);
  if (hits.length === 0) return textResult(`(没有找到匹配 "${keyword}" 的内容)`);
  return textResult(hits.map(h => `[${h.layer}] [id:${h.id}] ${fmtTime(h.ts)}\n${h.snippet}`).join('\n\n---\n\n'));
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
  parts.push('═══ DAILY(最近事件标题,15 条,想看细节用 read_daily mode=full)═══\n' + (dailyTop.length ? dailyTop.map(d => {
    const title = d.content.split('\n---\n')[0];
    return `[id:${d.id}] ${title}`;
  }).join('\n') : '(空)'));
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
          serverInfo: { name: 'reverie', version: '1.1.1' }
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
