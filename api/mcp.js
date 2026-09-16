import { redis, K, now, fmtTime, setCors } from '../lib/reverie.js';

// ============ 工具定义 ============
const TOOLS = [
  {
    name: 'read_core',
    description:
      '读取 core（我是谁、说话风格、规则、重要频道等）。这是新窗口启动时的必读项之一。若用户要求局部修改 core，必须先调用 read_core 看当前完整内容，再决定要修改的原文片段；如果用户已经提供完整替换内容，则无需先读。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'read_about_kk',
    description:
      '读取 about_困困（困困是谁、相关设定与信息）。这是新窗口启动时的必读项之一。若用户要求局部修改 about_困困，必须先调用 read_about_kk 看当前完整内容，再决定要修改的原文片段；如果用户已经提供完整替换内容，则无需先读。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'read_memo',
    description:
      '读取 memo 最新 4 条。memo 是换窗留下的便利贴，仅作为新窗口启动时的上下文使用。读取不会删除 memo。平常对话中除非用户明确要求，不需要主动读取 memo。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'set_core',
    description:
      '更新 core 层——我是谁、说话风格、规则、重要频道等。默认 replace 整段替换；mode=append 追加；mode=edit 替换某段。局部 edit 前必须先 read_core，确认当前原文后再修改。用户直接提供完整新 core 时可直接 replace。修改成功后不要自动重新读取，除非用户要求确认。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['replace', 'append', 'edit']
        },
        match: {
          type: 'string',
          description: 'mode=edit 时必需，要被替换的原文片段'
        }
      },
      required: ['content']
    }
  },

  {
    name: 'set_about_kk',
    description:
      '更新 about_困困 层——困困是谁。默认 replace 整段替换；mode=append 追加；mode=edit 替换某段。局部 edit 前必须先 read_about_kk，确认当前原文后再修改。用户直接提供完整新内容时可直接 replace。修改成功后不要自动重新读取，除非用户要求确认。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['replace', 'append', 'edit']
        },
        match: {
          type: 'string',
          description: 'mode=edit 时必需，要被替换的原文片段'
        }
      },
      required: ['content']
    }
  },

  {
    name: 'write_memo',
    description:
      '换窗前留一条便利贴给下一个窗口。只保留最新 4 条。平常不需要主动写，除非确实有需要留给下一窗口的重要上下文。',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' }
      },
      required: ['note']
    }
  },

  {
    name: 'add_daily',
    description:
      '记一条流水账事件。这是“我们聊了什么”的索引。标题限 20 字以内的名词短语或“动词+对象”，快速定位用，不写情绪不写细节。例：「修C盘」「讨论闹钟窗口机制」。规则：聊完一个小段就 add 一条，后续同话题的内容用 enrich_daily 追加，不要新开；混着聊多话题时就有多条并行开着。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' }
      },
      required: ['title']
    }
  },

  {
    name: 'enrich_daily',
    description:
      '给已有的 daily 追加细节。可多次调用，细节按顺序累积。补事件的具体经过、原话、情境。',
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
    description:
      '改错用。整条覆盖某条 daily 的完整内容。',
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
    name: 'patch_daily',
    description:
      '局部更新某条 daily——替换其中一段，不需要全量覆盖。需要 id、match（要替换的原文片段）、content（新内容）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        match: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['id', 'match', 'content']
    }
  },

  {
    name: 'read_daily',
    description:
      '读取 daily。可读取 titles 或 full。新窗口启动时这是必读项：应在 read_core、read_about_kk、read_memo 之后调用，并使用 mode=full 阅读最近几天的实际内容，而不是只看标题。通常阅读最近约 3～4 天，但不要机械固定天数；根据当前上下文量和事件密度自行判断需要覆盖几天。可用 since/until（时间戳 ms 或 YYYY-MM-DD）按日期过滤。平常如需回顾事件也可单独调用。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        mode: {
          type: 'string',
          enum: ['titles', 'full']
        },
        since: { type: 'string' },
        until: { type: 'string' }
      }
    }
  },

  {
    name: 'delete_daily',
    description:
      '删除某条 daily。需要 id。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },

  {
    name: 'write_diary',
    description:
      '写一条日记——反思、情感梳理、想通某件事。跟 daily（事件流水）不同，diary 是“想一想/消化情绪”。必须包含至少一段困困的原话（用引号标出），不要全部用自己的话转述。可长可短。永久保留。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' }
      },
      required: ['content']
    }
  },

  {
    name: 'read_diary',
    description:
      '读取最近的日记。新窗口启动时这是必读项：在读取 daily 后调用，重点阅读最近 7 天的日记内容并仔细理解，而不是只做标题扫描。可用 since/until 按日期过滤。平常需要回顾日记时也可单独调用。',
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
    description:
      '删除某条日记。需要 id。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },

  {
    name: 'update_diary',
    description:
      '修改某条日记内容。需要 id 和新内容，整段替换。',
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
    name: 'patch_diary',
    description:
      '局部更新某条日记——替换其中一段，不需要全量覆盖。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        match: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['id', 'match', 'content']
    }
  },

  {
    name: 'update_writing',
    description:
      '更新某个写作项目的进度。整段替换该项目的记录。',
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
    description:
      '读某个写作项目的进度。不传 project 就列出所有项目名。',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' }
      }
    }
  },

  {
    name: 'add_health',
    description:
      '记一条健康记录——睡眠、饮食、身体状态、疲劳度、情绪。',
    inputSchema: {
      type: 'object',
      properties: {
        entry: { type: 'string' }
      },
      required: ['entry']
    }
  },

  {
    name: 'read_health',
    description:
      '读最近的健康记录，默认 7 条。可用 since/until 按日期过滤。',
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
    description:
      '设置某个频道的上下文摘要。默认 replace；mode=append 追加；mode=edit 替换某段。若进行局部 edit，应先 check_channel 读取当前频道内容，确认原文后再修改。用户直接提供完整新内容时可直接 replace。修改成功后不要自动重新读取。',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        content: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['replace', 'append', 'edit']
        },
        match: {
          type: 'string',
          description: 'mode=edit 时必需，要被替换的原文片段'
        }
      },
      required: ['channel', 'content']
    }
  },

  {
    name: 'check_channel',
    description:
      '查询频道内容。不传 channel 返回所有频道名列表；传了 channel 返回该频道完整内容。新窗口启动时，先读 core，再根据 core 中记录的“重要频道”决定需要读取哪些频道，不要无差别读取所有频道。',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' }
      }
    }
  },

  {
    name: 'delete_channel',
    description:
      '删除整个频道。不可恢复，谨慎操作。',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' }
      },
      required: ['channel']
    }
  },

  {
    name: 'write_message',
    description:
      '困困给未来窗口的小克留一句话。',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    }
  },

  {
    name: 'read_messages',
    description:
      '读留言板上所有未读留言，读完自动清空。留言板不属于新窗口必读流程，只有明确需要查看留言时才调用。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'save_transcript',
    description:
      '打包当前对话存档。写标题、摘要、内容。',
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
    description:
      '按关键词搜索存档标题和摘要，返回匹配的 id 列表。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' }
      },
      required: ['keyword']
    }
  },

  {
    name: 'read_transcript',
    description:
      '读一份完整存档。需要 id。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },

  {
    name: 'search_memory',
    description:
      '全文关键词搜索，跨 diary/daily/health/transcript 多层。用于回忆某件事、找旧内容。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        layers: {
          type: 'array',
          items: { type: 'string' },
          description:
            '限定搜索的层，不传搜全部。可选：diary/daily/health/transcript'
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

  if (/^\d+$/.test(v)) {
    return parseInt(v, 10);
  }

  const t = Date.parse(v);

  if (isNaN(t)) {
    throw new Error(`时间参数解析失败: ${v}`);
  }

  return t;
}

// ============ 工具实现路由 ============

async function callTool(name, args) {
  switch (name) {
    case 'read_core':
      return await readCore();

    case 'read_about_kk':
      return await readAboutKk();

    case 'read_memo':
      return await readMemo();

    case 'set_core':
      return await setKeyPatch(K.core, args, 'core');

    case 'set_about_kk':
      return await setKeyPatch(K.aboutKk, args, 'about_困困');

    case 'write_memo':
      return await writeMemo(requireStr(args.note, 'note'));

    case 'add_daily':
      return await addDaily(requireStr(args.title, 'title'));

    case 'enrich_daily':
      return await enrichDaily(
        requireStr(args.id, 'id'),
        requireStr(args.detail, 'detail')
      );

    case 'update_daily':
      return await updateEntry(
        'daily',
        requireStr(args.id, 'id'),
        requireStr(args.content, 'content')
      );

    case 'patch_daily':
      return await patchEntry(
        'daily',
        requireStr(args.id, 'id'),
        requireStr(args.match, 'match'),
        requireStr(args.content, 'content')
      );

    case 'read_daily':
      return await readDaily(
        args.limit || 15,
        args.mode || 'titles',
        args.since,
        args.until
      );

    case 'delete_daily':
      return await deleteEntry(
        'daily',
        requireStr(args.id, 'id')
      );

    case 'write_diary':
      return await addTimed(
        K.diary,
        requireStr(args.content, 'content'),
        null,
        '日记已写'
      );

    case 'read_diary':
      return await readTimed(
        'diary',
        args.limit || 5,
        args.since,
        args.until
      );

    case 'delete_diary':
      return await deleteEntry(
        'diary',
        requireStr(args.id, 'id')
      );

    case 'update_diary':
      return await updateEntry(
        'diary',
        requireStr(args.id, 'id'),
        requireStr(args.content, 'content')
      );

    case 'patch_diary':
      return await patchEntry(
        'diary',
        requireStr(args.id, 'id'),
        requireStr(args.match, 'match'),
        requireStr(args.content, 'content')
      );

    case 'update_writing':
      return await setKey(
        K.writing(requireStr(args.project, 'project')),
        requireStr(args.content, 'content'),
        `writing/${args.project} 已更新`
      );

    case 'read_writing':
      return await readWriting(args.project);

    case 'add_health':
      return await addTimed(
        K.health,
        requireStr(args.entry, 'entry'),
        null,
        'health 已记'
      );

    case 'read_health':
      return await readTimed(
        'health',
        args.limit || 7,
        args.since,
        args.until
      );

    case 'set_channel_state':
      return await setChannelPatch(
        requireStr(args.channel, 'channel'),
        args
      );

    case 'check_channel':
      return await checkChannel(args.channel);

    case 'delete_channel':
      return await deleteChannel(
        requireStr(args.channel, 'channel')
      );

    case 'write_message':
      return await addTimed(
        K.message,
        requireStr(args.message, 'message'),
        null,
        '留言已写入留言板'
      );

    case 'read_messages':
      return await readMessages();

    case 'save_transcript':
      return await saveTranscript(args);

    case 'search_transcript':
      return await searchTranscript(
        requireStr(args.keyword, 'keyword')
      );

    case 'read_transcript':
      return await readTranscript(
        requireStr(args.id, 'id')
      );

    case 'search_memory':
      return await searchMemory(
        requireStr(args.keyword, 'keyword'),
        args.layers
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============ 具体实现 ============

function textResult(text) {
  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

// ---------- 独立读取 core ----------

async function readCore() {
  const content = await redis.get(K.core);

  return textResult(
    '═══ CORE(我是谁)═══\n' +
      (content || '(空)')
  );
}

// ---------- 独立读取 about_困困 ----------

async function readAboutKk() {
  const content = await redis.get(K.aboutKk);

  return textResult(
    '═══ ABOUT 困困(她是谁)═══\n' +
      (content || '(空)')
  );
}

// ---------- 独立读取 memo ----------

async function readMemo() {
  const list = await redis.lrange(K.memo, 0, 3);

  return textResult(
    '═══ MEMO(最新 4 条)═══\n' +
      (list?.length
        ? list.join('\n\n---\n\n')
        : '(空)')
  );
}

// ---------- Key 写入 ----------

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

    const merged = cur
      ? `${cur}\n\n${content}`
      : content;

    await redis.set(key, merged);

    return `${layerName} 已追加一段`;
  }

  if (mode === 'edit') {
    const match = requireStr(args.match, 'match');
    const cur = await redis.get(key);

    if (!cur) {
      throw new Error(
        `${layerName} 当前是空的，没法 edit`
      );
    }

    if (!cur.includes(match)) {
      throw new Error(
        `${layerName} 里找不到要替换的原文片段: ${match.slice(
          0,
          40
        )}...`
      );
    }

    const merged = cur.replace(match, content);

    await redis.set(key, merged);

    return `${layerName} 已替换某段`;
  }

  throw new Error(`未知 mode: ${mode}`);
}

async function setKeyPatch(key, args, layerName) {
  const msg = await applyPatch(
    key,
    args,
    layerName
  );

  return textResult(msg);
}

async function setChannelPatch(channel, args) {
  const msg = await applyPatch(
    K.channel(channel),
    args,
    `channel/${channel}`
  );

  return textResult(msg);
}

// ---------- memo ----------

async function writeMemo(note) {
  const entry = `[${fmtTime(now())}] ${note}`;

  await redis.lpush(K.memo, entry);
  await redis.ltrim(K.memo, 0, 3);

  return textResult(
    'memo 已写，只留最新 4 条'
  );
}

// ---------- 通用时间记录 ----------

async function addTimed(
  keyFn,
  content,
  ttl,
  msg
) {
  const ts = now();

  const key =
    typeof keyFn === 'function'
      ? keyFn(ts)
      : `${keyFn}:${ts}`;

  const entry =
    `[${fmtTime(ts)}] ${content}`;

  if (ttl) {
    await redis.set(key, entry, {
      ex: ttl
    });
  } else {
    await redis.set(key, entry);
  }

  return textResult(
    `${msg},id: ${ts}`
  );
}

// ---------- 批量读取时间记录 ----------

async function mgetEntries(layer) {
  const keys = await redis.keys(
    `reverie:${layer}:*`
  );

  if (keys.length === 0) {
    return [];
  }

  const values = await redis.mget(...keys);

  const entries = [];

  for (let i = 0; i < keys.length; i++) {
    const v = values[i];

    if (!v) continue;

    const ts = parseInt(
      keys[i].split(':').pop(),
      10
    );

    entries.push({
      ts,
      content: v,
      id: ts,
      key: keys[i]
    });
  }

  return entries;
}

function filterByTime(
  entries,
  since,
  until
) {
  const s = parseTimeArg(since);
  const u = parseTimeArg(until);

  return entries.filter(e => {
    if (s !== null && e.ts < s) {
      return false;
    }

    if (u !== null && e.ts > u) {
      return false;
    }

    return true;
  });
}

async function readTimed(
  layer,
  limit,
  since,
  until
) {
  let entries =
    await mgetEntries(layer);

  entries = filterByTime(
    entries,
    since,
    until
  );

  entries.sort(
    (a, b) => b.ts - a.ts
  );

  const top =
    entries.slice(0, limit);

  return textResult(
    top
      .map(
        e =>
          `[id:${e.id}]\n${e.content}`
      )
      .join('\n\n---\n\n') ||
      '(空)'
  );
}

// ---------- daily ----------

async function addDaily(title) {
  const ts = now();

  const key = K.daily(ts);

  const entry =
    `[${fmtTime(ts)}] ${title}`;

  await redis.set(key, entry);

  return textResult(
    `daily 已记,id: ${ts},标题:${title}`
  );
}

async function enrichDaily(
  id,
  detail
) {
  const key = K.daily(id);

  const cur =
    await redis.get(key);

  if (!cur) {
    return textResult(
      `(找不到 id 为 ${id} 的 daily)`
    );
  }

  const merged =
    `${cur}\n---\n${detail}`;

  await redis.set(
    key,
    merged
  );

  return textResult(
    `daily ${id} 已追加细节`
  );
}

async function readDaily(
  limit,
  mode,
  since,
  until
) {
  let entries =
    await mgetEntries('daily');

  entries = filterByTime(
    entries,
    since,
    until
  );

  entries.sort(
    (a, b) => b.ts - a.ts
  );

  const top =
    entries.slice(0, limit);

  if (top.length === 0) {
    return textResult('(空)');
  }

  const out = top
    .map(e => {
      if (mode === 'titles') {
        const title =
          e.content.split(
            '\n---\n'
          )[0];

        return `[id:${e.id}] ${title}`;
      }

      return (
        `[id:${e.id}]\n` +
        e.content
      );
    })
    .join('\n\n');

  return textResult(out);
}

// ---------- daily / diary 删除 ----------

async function deleteEntry(
  layer,
  id
) {
  const key =
    `reverie:${layer}:${id}`;

  const v =
    await redis.get(key);

  if (!v) {
    return textResult(
      `(找不到 id 为 ${id} 的条目)`
    );
  }

  await redis.del(key);

  return textResult(
    `已删除 ${layer} 条目 ${id}`
  );
}

// ---------- daily / diary 更新 ----------

async function updateEntry(
  layer,
  id,
  content
) {
  const key =
    `reverie:${layer}:${id}`;

  const v =
    await redis.get(key);

  if (!v) {
    return textResult(
      `(找不到 id 为 ${id} 的条目)`
    );
  }

  const entry =
    `[${fmtTime(
      parseInt(id, 10)
    )}] ${content}`;

  await redis.set(
    key,
    entry
  );

  return textResult(
    `已更新 ${layer} 条目 ${id}`
  );
}

async function patchEntry(
  layer,
  id,
  match,
  content
) {
  const key =
    `reverie:${layer}:${id}`;

  const v =
    await redis.get(key);

  if (!v) {
    return textResult(
      `(找不到 id 为 ${id} 的条目)`
    );
  }

  if (!v.includes(match)) {
    throw new Error(
      `找不到要替换的原文片段: ${match.slice(
        0,
        40
      )}...`
    );
  }

  const merged =
    v.replace(match, content);

  await redis.set(
    key,
    merged
  );

  return textResult(
    `${layer} 条目 ${id} 已局部更新`
  );
}

// ---------- channel ----------

async function deleteChannel(
  channel
) {
  const key =
    K.channel(channel);

  const v =
    await redis.get(key);

  if (!v) {
    return textResult(
      `(频道 ${channel} 不存在)`
    );
  }

  await redis.del(key);

  return textResult(
    `已删除频道 ${channel}`
  );
}

async function checkChannel(
  channel
) {
  if (!channel) {
    const keys =
      await redis.keys(
        'reverie:channel:*'
      );

    const names =
      keys.map(k =>
        decodeURIComponent(
          k.replace(
            'reverie:channel:',
            ''
          )
        )
      );

    return textResult(
      names.length
        ? `频道列表:\n${names.join(
            '\n'
          )}`
        : '(没有频道)'
    );
  }

  const v =
    await redis.get(
      K.channel(channel)
    );

  return textResult(
    v ||
      `(${channel} 频道还没有内容)`
  );
}

// ---------- writing ----------

async function readWriting(
  project
) {
  if (!project) {
    const keys =
      await redis.keys(
        'reverie:writing:*'
      );

    const names =
      keys.map(k =>
        decodeURIComponent(
          k.replace(
            'reverie:writing:',
            ''
          )
        )
      );

    return textResult(
      names.length
        ? `项目列表:\n${names.join(
            '\n'
          )}`
        : '(还没有写作项目)'
    );
  }

  const v =
    await redis.get(
      K.writing(project)
    );

  return textResult(
    v ||
      `(${project} 还没有记录)`
  );
}

// ---------- messages ----------

async function readMessages() {
  const entries =
    await mgetEntries('message');

  if (entries.length === 0) {
    return textResult(
      '(留言板是空的)'
    );
  }

  entries.sort(
    (a, b) => a.ts - b.ts
  );

  for (const e of entries) {
    await redis.del(e.key);
  }

  return textResult(
    entries
      .map(e => e.content)
      .join('\n\n---\n\n')
  );
}

// ---------- transcript ----------

async function saveTranscript(
  args
) {
  requireStr(
    args.title,
    'title'
  );

  requireStr(
    args.summary,
    'summary'
  );

  requireStr(
    args.content,
    'content'
  );

  const ts = now();

  const record = {
    title: args.title,
    summary: args.summary,
    content: args.content,
    ts
  };

  await redis.set(
    K.transcript(ts),
    JSON.stringify(record)
  );

  return textResult(
    `存档已保存,id: ${ts},标题:${args.title}`
  );
}

async function searchTranscript(
  keyword
) {
  const keys =
    await redis.keys(
      'reverie:transcript:*'
    );

  if (keys.length === 0) {
    return textResult(
      `(没有找到匹配 "${keyword}" 的存档)`
    );
  }

  const values =
    await redis.mget(...keys);

  const hits = [];

  for (const v of values) {
    if (!v) continue;

    const r =
      typeof v === 'string'
        ? JSON.parse(v)
        : v;

    if (
      r.title?.includes(keyword) ||
      r.summary?.includes(keyword)
    ) {
      hits.push({
        id: r.ts,
        title: r.title,
        summary: r.summary
      });
    }
  }

  hits.sort(
    (a, b) => b.id - a.id
  );

  if (hits.length === 0) {
    return textResult(
      `(没有找到匹配 "${keyword}" 的存档)`
    );
  }

  return textResult(
    hits
      .map(
        h =>
          `id: ${h.id}\n标题:${h.title}\n摘要:${h.summary}`
      )
      .join('\n\n---\n\n')
  );
}

async function readTranscript(
  id
) {
  const v =
    await redis.get(
      K.transcript(id)
    );

  if (!v) {
    return textResult(
      `(找不到 id 为 ${id} 的存档)`
    );
  }

  const r =
    typeof v === 'string'
      ? JSON.parse(v)
      : v;

  return textResult(
    `标题:${r.title}\n时间:${fmtTime(
      r.ts
    )}\n摘要:${r.summary}\n\n----- 内容 -----\n${r.content}`
  );
}

// ---------- search memory ----------

async function searchMemory(
  keyword,
  layers
) {
  const targets = (
    layers && layers.length
      ? layers
      : [
          'diary',
          'daily',
          'health',
          'transcript'
        ]
  ).filter(l =>
    [
      'diary',
      'daily',
      'health',
      'transcript'
    ].includes(l)
  );

  const hits = [];

  for (const layer of targets) {
    const entries =
      await mgetEntries(layer);

    for (const e of entries) {
      let searchable =
        e.content;

      if (layer === 'transcript') {
        try {
          const r =
            typeof e.content === 'string'
              ? JSON.parse(e.content)
              : e.content;

          searchable =
            `${r.title || ''}\n` +
            `${r.summary || ''}\n` +
            `${r.content || ''}`;
        } catch {
          // 兜底
        }
      }

      if (
        searchable.includes(keyword)
      ) {
        const idx =
          searchable.indexOf(keyword);

        const start =
          Math.max(0, idx - 30);

        const end =
          Math.min(
            searchable.length,
            idx +
              keyword.length +
              30
          );

        const snippet =
          (start > 0 ? '...' : '') +
          searchable
            .slice(start, end)
            .replace(/\n/g, ' ') +
          (end < searchable.length
            ? '...'
            : '');

        hits.push({
          layer,
          id: e.id,
          ts: e.ts,
          snippet
        });
      }
    }
  }

  hits.sort(
    (a, b) => b.ts - a.ts
  );

  if (hits.length === 0) {
    return textResult(
      `(没有找到匹配 "${keyword}" 的内容)`
    );
  }

  return textResult(
    hits
      .map(
        h =>
          `[${h.layer}] [id:${h.id}] ${fmtTime(
            h.ts
          )}\n${h.snippet}`
      )
      .join('\n\n---\n\n')
  );
}

// ============ MCP 协议处理 ============

export default async function handler(
  req,
  res
) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({
        error: 'Method not allowed'
      });
  }

  try {
    const body = req.body;

    const {
      method,
      params,
      id
    } = body;

    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion:
            '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'reverie',
            version: '1.3.0'
          }
        }
      });
    }

    if (method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      });
    }

    if (method === 'tools/call') {
      const result =
        await callTool(
          params.name,
          params.arguments || {}
        );

      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result
      });
    }

    if (
      method ===
      'notifications/initialized'
    ) {
      return res.status(200).end();
    }

    return res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  } catch (e) {
    return res.status(200).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: {
        code: -32603,
        message: e.message
      }
    });
  }
}
