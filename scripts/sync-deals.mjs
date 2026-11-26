import fs from 'node:fs';
import path from 'node:path';

const XRB_API = 'https://www.xianrenbing.com/api/v1/deals?period=week&page_size=100&page=1';
const XRB_SITE = 'https://www.xianrenbing.com';
const TG_CHANNEL = 'https://t.me/xianrenbing_ai';
const LUFEI_SITE = 'https://lufeiai.shop/go/06862e33b7';
const RESET_SITE = 'https://reset.lufeiai.shop/';

const RE_SKIP = /已结束|已失效|已售罄|转让|收一台|出一台|测速(?:报告|留档)|家宽|代理IP|到期20\d{6}|小红书养号/i;
const RE_HOT_BRAND = /ChatGPT|OpenAI|\bGPT\b|Claude|Codex|Gemini|Cursor|Windsurf|DeepSeek|Kimi|Qwen|通义|GLM|智谱|Antigravity|微信|腾讯|阿里|字节|豆包|硅基流动|免费\s*API|免费服务器|云主机|黑五/i;
const RE_FREE = /永久免费|免费额度|限免|0元|免费领|白嫖|月卡|兑换码|公益|开源|免费/i;

function getBeijingDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cleanText(raw, maxLen = 140) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '｜')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function classify(item) {
  const t = `${item.title || ''} ${item.category_name || ''}`;
  if (/\bAPI\b|大模型|Token|Gemini|DeepSeek|GPT|Claude|中转|模型|Qwen|GLM/i.test(t) && !/编程|IDE|Cursor|Codex|Agent|CLI/i.test(t)) {
    return '大模型 API 与免费额度';
  }
  if (/编程|代码|IDE|Cursor|Windsurf|Codex|Claude Code|Agent|MCP|GitHub|CLI|开发工具|Antigravity/i.test(t)) {
    return 'AI 编程与开源开发工具';
  }
  if (/图像|视频|绘图|3D|可灵|Kling|Flux|字幕|语音|音频|OCR|剪辑/i.test(t)) {
    return 'AI 图像、视频与多模态';
  }
  return '云算力补贴与综合福利';
}

function scoreItem(item) {
  const t = `${item.title || ''} ${item.public_summary || ''}`;
  let score = 50;
  if (RE_FREE.test(t)) score += 35;
  if (RE_HOT_BRAND.test(t)) score += 45;
  if (/仅限欧洲|欧洲用户|仅限美区|仅限美国|仅限印度/i.test(t)) score -= 40;
  return score;
}

async function main() {
  const res = await fetch(XRB_API, {
    headers: { 'User-Agent': 'Awesome-AI-Free-Deals-Sync/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch Xianrenbing API: HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('Invalid API payload');

  const today = getBeijingDate();
  const valid = raw
    .filter((it) => it && it.id && it.title && it.status !== 'EXPIRED' && !RE_SKIP.test(it.title))
    .map((it) => ({
      id: String(it.id),
      title: cleanText(it.title, 72),
      summary: cleanText(it.public_summary || '详见原帖规则与实时有效状态。', 110),
      category: classify(it),
      score: scoreItem(it),
      url: `${XRB_SITE}/deal/${it.id}`,
      createdAt: String(it.created_at || '').slice(0, 10) || today,
    }))
    .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));

  const deduped = [...new Map(valid.map((v) => [v.title.toLowerCase(), v])).values()].slice(0, 28);
  const groups = new Map([
    ['大模型 API 与免费额度', []],
    ['AI 编程与开源开发工具', []],
    ['AI 图像、视频与多模态', []],
    ['云算力补贴与综合福利', []],
  ]);
  for (const item of deduped) {
    groups.get(item.category).push(item);
  }

  const sections = [];
  sections.push(`## 今日精选清单（更新日期：${today} 北京时间）`);
  sections.push('');
  sections.push(`本次共筛选 **${deduped.length}** 条高价值 AI 免费额度与优惠线报，按热度与国内可用性排序：`);
  sections.push('');

  for (const [groupName, items] of groups.entries()) {
    if (!items.length) continue;
    sections.push(`### ${groupName}`);
    sections.push('');
    sections.push('| 线报标题 | 亮点与条件摘要 | 日期 | 详情 |');
    sections.push('| --- | --- | --- | --- |');
    for (const it of items.slice(0, 8)) {
      sections.push(`| **${it.title}** | ${it.summary} | ${it.createdAt} | [查看验真](${it.url}) |`);
    }
    sections.push('');
  }

  sections.push('### 常用工具与实时推送');
  sections.push('');
  sections.push(`- Telegram 实时精选播报频道（免刷屏）：[@xianrenbing_ai](${TG_CHANNEL})`);
  sections.push(`- 实时免费羊毛与饼友验真：[仙人饼社区](${XRB_SITE}/) · [2026 AI 订阅全球比价](${XRB_SITE}/prices) · [每日领免费 Token](${XRB_SITE}/daily-tokens)`);
  sections.push(`- ChatGPT / Claude / Codex / Gemini 24h 全自动现货：[路飞AI 商城](${LUFEI_SITE})`);
  sections.push(`- Codex / Antigravity / Claude 额度重置监控：[AI 重置雷达](${RESET_SITE})`);

  const block = sections.join('\n');

  const readmePath = path.resolve('README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const updated = readme.replace(
    /<!-- AUTO_UPDATED_START -->[\s\S]*?<!-- AUTO_UPDATED_END -->/,
    `<!-- AUTO_UPDATED_START -->\n${block}\n<!-- AUTO_UPDATED_END -->`
  );
  fs.writeFileSync(readmePath, updated, 'utf8');

  const archiveDir = path.resolve('archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, `${today}.md`), `# AI 免费额度与省钱日报（${today}）\n\n${block}\n`, 'utf8');
  console.log(`Synced ${deduped.length} deals for ${today}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
