#!/usr/bin/env node
/**
 * 新番播出时间表生成器
 * 用法: node generate.js --input "bgm_info.txt" [--output "dir"] [--season 春] [--year 2026] [--html-only]
 */

const fs = require('fs');
const path = require('path');

// ======================== 参数解析 ========================
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { input: null, output: null, season: null, year: null, htmlOnly: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input': case '-i': opts.input = args[++i]; break;
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--season': case '-s': opts.season = args[++i]; break;
      case '--year': case '-y': opts.year = args[++i]; break;
      case '--html-only': opts.htmlOnly = true; break;
    }
  }
  if (!opts.input) {
    console.error('用法: node generate.js --input "bgm_info.txt" [--output "dir"] [--season 春] [--year 2026] [--html-only]');
    process.exit(1);
  }
  return opts;
}

// ======================== 四季主题色 ========================
const SEASONS = {
  春: {
    label: '春',
    seasonNum: (y) => `${y}年春季新番`,
    titleText: (y) => `${y.slice(-2)} 年 春 季 番 播 出 时 间 表`,
    bodyBg: '#f5e6e8', wrapperBg: '#fdf6f7',
    titleBar: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 40%, #f1948a 100%)',
    titleBarShadow: 'rgba(192,57,43,0.3)',
    headerBg: '#c0392b', headerBorder: '#a93226',
    yomiBg: '#f8bbd0', yomiBorder: '#e91e63', yomiColor: '#880e4f',
    dateBg: '#fce4ec', rowEven: '#fff5f5', rowHover: '#ffebee',
    timeColor: '#c0392b', footerBg: '#c0392b',
  },
  夏: {
    label: '夏',
    seasonNum: (y) => `${y}年夏季新番`,
    titleText: (y) => `${y.slice(-2)} 年 夏 季 番 播 出 时 间 表`,
    bodyBg: '#e0f0f8', wrapperBg: '#f5fafd',
    titleBar: 'linear-gradient(135deg, #1565c0 0%, #1e88e5 40%, #64b5f6 100%)',
    titleBarShadow: 'rgba(21,101,192,0.3)',
    headerBg: '#1565c0', headerBorder: '#0d47a1',
    yomiBg: '#b3e5fc', yomiBorder: '#0288d1', yomiColor: '#01579b',
    dateBg: '#e1f5fe', rowEven: '#f5faff', rowHover: '#e3f2fd',
    timeColor: '#d32f2f', footerBg: '#1565c0',
  },
  秋: {
    label: '秋',
    seasonNum: (y) => `${y}年秋季新番`,
    titleText: (y) => `${y.slice(-2)} 年 秋 季 番 播 出 时 间 表`,
    bodyBg: '#f0e4d4', wrapperBg: '#fdf8f2',
    titleBar: 'linear-gradient(135deg, #bf360c 0%, #e65100 40%, #ff8a65 100%)',
    titleBarShadow: 'rgba(191,54,12,0.3)',
    headerBg: '#bf360c', headerBorder: '#a62b08',
    yomiBg: '#ffcc80', yomiBorder: '#ef6c00', yomiColor: '#e65100',
    dateBg: '#fff3e0', rowEven: '#fdf8f0', rowHover: '#fff3e0',
    timeColor: '#bf360c', footerBg: '#bf360c',
  },
  冬: {
    label: '冬',
    seasonNum: (y) => `${y}年冬季新番`,
    titleText: (y) => `${y.slice(-2)} 年 冬 季 番 播 出 时 间 表`,
    bodyBg: '#dce4ec', wrapperBg: '#f0f4f8',
    titleBar: 'linear-gradient(135deg, #1a237e 0%, #283593 40%, #5c6bc0 100%)',
    titleBarShadow: 'rgba(26,35,126,0.3)',
    headerBg: '#1a237e', headerBorder: '#0d1458',
    yomiBg: '#c5cae9', yomiBorder: '#3949ab', yomiColor: '#1a237e',
    dateBg: '#e8eaf6', rowEven: '#f5f6fa', rowHover: '#e8eaf6',
    timeColor: '#b71c1c', footerBg: '#1a237e',
  },
};

// ======================== 季节识别 ========================
function detectSeason(entries) {
  const monthCount = { 冬: 0, 春: 0, 夏: 0, 秋: 0 };
  for (const e of entries) {
    if (e.month >= 3 && e.month <= 5) monthCount.春++;
    else if (e.month >= 6 && e.month <= 8) monthCount.夏++;
    else if (e.month >= 9 && e.month <= 11) monthCount.秋++;
    else monthCount.冬++;
  }
  return Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0][0];
}

function detectYear(entries) {
  const yearCount = {};
  for (const e of entries) {
    const y = e.dateStr.match(/(\d+)年/);
    if (y) yearCount[y[1]] = (yearCount[y[1]] || 0) + 1;
  }
  return Object.entries(yearCount).sort((a, b) => b[1] - a[1])[0]?.[0] || String(new Date().getFullYear());
}

// ======================== 数据解析 ========================
function parseEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = [];
  const blocks = raw.split(/^\d+\.\s/m).filter(b => b.trim());
  const dayMap = { '周日': '日', '周一': '月', '周二': '火', '周三': '水', '周四': '木', '周五': '金', '周六': '土' };

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const title = lines[0];
    const get = (key) => {
      const line = lines.find(l => l.startsWith(`${key}:`));
      return line ? line.replace(`${key}:`, '').trim() : '';
    };
    const timeStr = get('播出时间(JST)');
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*\((.+?)\)/);
    if (!timeMatch) continue;

    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2];
    const dayJp = timeMatch[3];
    const yomi = dayMap[dayJp] || dayJp;

    const dateStr = get('放送日期');
    const dateMatch = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
    const month = dateMatch ? parseInt(dateMatch[2]) : 0;
    const day = dateMatch ? parseInt(dateMatch[3]) : 0;

    entries.push({
      title, dateStr,
      chineseName: get('中文名') || '',
      type: get('类型'),
      studio: get('动画制作'),
      month, day,
      time: `${String(hour).padStart(2, '0')}:${minute}`,
      hour, minute: parseInt(minute),
      platform: get('播放平台'),
      yomi,
    });
  }
  return entries;
}

function sortEntries(entries) {
  const yomiOrder = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
  entries.sort((a, b) => {
    const ya = yomiOrder[a.yomi] ?? 7, yb = yomiOrder[b.yomi] ?? 7;
    if (ya !== yb) return ya - yb;
    const ha = a.hour < 6 ? a.hour + 24 : a.hour;
    const hb = b.hour < 6 ? b.hour + 24 : b.hour;
    if (ha !== hb) return ha - hb;
    return a.minute - b.minute;
  });
  return entries;
}

function groupByYomi(entries) {
  const groups = {};
  for (const e of entries) { (groups[e.yomi] = groups[e.yomi] || []).push(e); }
  return groups;
}

// ======================== HTML 生成 ========================
function generateHTML(entries, seasonKey, year) {
  const S = SEASONS[seasonKey];
  const groups = groupByYomi(entries);
  const yomiOrderList = ['日', '月', '火', '水', '木', '金', '土'];
  const yy = year.slice(-2);

  // 预处理显示时间和日期
  for (const e of entries) {
    e._displayTime = e.hour >= 24
      ? `${String(e.hour - 24).padStart(2, '0')}:${e.minute.toString().padStart(2, '0')}`
      : e.time;
    e._dateDisplay = `${e.month}月${e.day}日`;
  }

  let tableRows = '';
  for (const yomi of yomiOrderList) {
    const items = groups[yomi];
    if (!items || items.length === 0) continue;

    // 日期合并
    const dateMerge = new Array(items.length).fill(0);
    let i = 0;
    while (i < items.length) {
      let j = i + 1;
      while (j < items.length && items[j]._dateDisplay === items[i]._dateDisplay) j++;
      dateMerge[i] = j - i;
      i = j;
    }
    // 时间合并
    const timeMerge = new Array(items.length).fill(0);
    i = 0;
    while (i < items.length) {
      let j = i + 1;
      while (j < items.length && items[j]._displayTime === items[i]._displayTime) j++;
      timeMerge[i] = j - i;
      i = j;
    }

    for (let idx = 0; idx < items.length; idx++) {
      const e = items[idx];
      tableRows += `<tr>`;
      if (idx === 0) tableRows += `<td class="yomi-cell" rowspan="${items.length}">${yomi}</td>`;
      if (dateMerge[idx] > 0) tableRows += `<td class="date-cell" rowspan="${dateMerge[idx]}">${e._dateDisplay}</td>`;
      if (timeMerge[idx] > 0) tableRows += `<td class="time-cell" rowspan="${timeMerge[idx]}">${e._displayTime}</td>`;
      tableRows += `<td class="title-cell">${e.title}</td>`;
      tableRows += `<td class="chinese-cell">${e.chineseName}</td>`;
      tableRows += `<td class="type-cell">${e.type}</td>`;
      tableRows += `<td class="studio-cell">${e.studio}</td>`;
      tableRows += `<td class="platform-cell">${e.platform}</td>`;
      tableRows += `</tr>\n`;
    }
  }

  const totalCount = entries.length;
  const typeCount = {};
  for (const e of entries) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
  const badgeHTML = Object.entries(typeCount)
    .map(([k, v]) => `<span class="stat-badge type-${k}">${k}: ${v}部</span>`)
    .join('\n      ');

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${S.titleText(year)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
    background: ${S.bodyBg}; padding: 20px; min-height: 100vh;
  }
  .schedule-wrapper {
    max-width: 1600px; margin: 0 auto; background: ${S.wrapperBg};
    border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }
  .title-bar {
    background: ${S.titleBar}; color: white; padding: 20px 30px;
    text-align: center; position: relative; box-shadow: 0 4px 12px ${S.titleBarShadow};
  }
  .title-bar h1 { font-size: 2.2em; font-weight: 900; letter-spacing: 4px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
  .title-bar .subtitle { font-size: 0.9em; opacity: 0.85; margin-top: 5px; }
  .title-bar .author { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); font-size: 0.9em; opacity: 0.75; font-weight: 700; }
  .schedule-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  .schedule-table thead th {
    background: ${S.headerBg}; color: white; padding: 10px 8px;
    font-weight: 700; text-align: center; border: 1px solid ${S.headerBorder}; white-space: nowrap;
  }
  .schedule-table tbody td {
    padding: 7px 10px; border: 1px solid #d0d0d0; vertical-align: middle;
    word-break: break-all; white-space: normal;
  }
  .schedule-table tbody tr:nth-child(even) { background: ${S.rowEven}; }
  .schedule-table tbody tr:hover { background: ${S.rowHover}; }
  .yomi-cell {
    background: ${S.yomiBg} !important; font-size: 2.4em; font-weight: 900;
    text-align: center; color: ${S.yomiColor}; border: 2px solid ${S.yomiBorder} !important; width: 56px;
  }
  .date-cell {
    text-align: center; font-weight: 700; color: #444; white-space: nowrap;
    background: ${S.dateBg} !important; width: 1.6em;
  }
  .time-cell {
    text-align: center; font-weight: 700; color: ${S.timeColor}; white-space: nowrap;
    font-size: 1.05em; width: 1.6em;
  }
  .title-cell { font-weight: 700; color: #1a1a1a; width: 10em; }
  .chinese-cell { color: #2c3e50; width: 10em; }
  .type-cell { text-align: center; white-space: nowrap; font-weight: 700; width: 1.6em; }
  .studio-cell { color: #555; width: 7em; }
  .platform-cell { text-align: center; white-space: nowrap; color: #1565c0; font-weight: 700; width: 6em; }
  .footer {
    background: ${S.footerBg}; color: white; padding: 25px 30px;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 30px;
  }
  .footer-info { font-size: 0.9em; line-height: 1.8; }
  .footer-info .note { opacity: 0.85; }
  .footer-stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-badge {
    background: white; color: #333; padding: 6px 14px; border-radius: 4px;
    font-size: 0.85em; white-space: nowrap; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .type-漫画改 { color: #0d47a1; }
  .type-小说改 { color: #4a148c; }
  .type-原创  { color: #1b5e20; }
  .type-游戏改 { color: #e65100; }
  .type-泡面  { color: #b71c1c; }
</style>
</head>
<body>
<div class="schedule-wrapper">
  <div class="title-bar">
    <h1>${S.titleText(year)}</h1>
    <div class="subtitle">${S.seasonNum(year)} · ${totalCount}部作品 · UTC+9 (JST)</div>
    <div class="author">By AttoUmani</div>
  </div>
  <table class="schedule-table">
    <thead>
      <tr>
        <th style="width:56px">曜日</th>
        <th style="width:1.6em">日期</th>
        <th style="width:1.6em">时间</th>
        <th style="width:10em">番名</th>
        <th style="width:10em">中文名</th>
        <th style="width:1.6em">分类</th>
        <th style="width:7em">动画制作公司</th>
        <th style="width:6em">首播渠道</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
  <div class="footer">
    <div class="footer-info">
      <div class="note">· U T C + 9</div>
      <div class="note">· 三十小时制</div>
      <div class="note">· 信息来源：bgm.tv / bgm.wiki</div>
      <div class="note">· 本表仅收录${totalCount}部${S.label}季番剧</div>
      <div class="note">· 统计截止${today}</div>
    </div>
    <div class="footer-stats">${badgeHTML}</div>
  </div>
</div>
</body>
</html>`;
}

// ======================== PNG 转换 ========================
async function generatePNG(htmlPath, pngPath) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log('[跳过PNG] playwright 未安装，仅生成 HTML');
    return false;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1800, height: 800 });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const wrapper = await page.$('.schedule-wrapper');
  if (wrapper) {
    await wrapper.screenshot({ path: pngPath, type: 'png' });
  } else {
    await page.screenshot({ path: pngPath, fullPage: true, type: 'png' });
  }
  await page.close();
  await browser.close();
  return true;
}

// ======================== 主流程 ========================
async function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`[错误] 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const entries = parseEntries(inputPath);
  if (entries.length === 0) {
    console.error('[错误] 未解析到有效动画条目');
    process.exit(1);
  }

  const season = opts.season || detectSeason(entries);
  const year = opts.year || detectYear(entries);
  const S = SEASONS[season];

  if (!S) {
    console.error(`[错误] 未知季节: ${season}，可选: 冬/春/夏/秋`);
    process.exit(1);
  }

  sortEntries(entries);

  const outDir = opts.output ? path.resolve(opts.output) : path.dirname(inputPath);
  fs.mkdirSync(outDir, { recursive: true });

  const yy = year.slice(-2);
  const baseName = `${yy}年${S.label}季番播出时间表`;
  const htmlPath = path.join(outDir, `${baseName}.html`);
  const pngPath = path.join(outDir, `${baseName}.png`);

  const html = generateHTML(entries, season, year);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`[HTML] ${htmlPath} — ${entries.length}部`);

  if (!opts.htmlOnly) {
    const ok = await generatePNG(htmlPath, pngPath);
    if (ok) console.log(`[PNG]  ${pngPath}`);
  }

  // 统计
  const typeCount = {};
  for (const e of entries) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
  console.log(`[统计] ${JSON.stringify(typeCount)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
