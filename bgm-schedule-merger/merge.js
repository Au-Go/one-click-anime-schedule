#!/usr/bin/env node
/**
 * BGM 播出时间整合工具
 * 从 bgm.wiki 获取动画播出时间和平台信息，与已有新番表整合。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');

// 临时目录
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bgm-'));

/**
 * 执行 curl 命令
 */
function curl(url, options = {}) {
    const { cookiesFile, headers = {}, method = 'GET', silent = true } = options;

    let cmd = 'curl -s -L';
    if (cookiesFile) {
        cmd += ` -b "${cookiesFile}" -c "${cookiesFile}"`;
    }
    cmd += ' -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';

    for (const [key, value] of Object.entries(headers)) {
        cmd += ` -H "${key}: ${value}"`;
    }

    if (method === 'POST') {
        cmd += ' -X POST';
    }

    cmd += ` "${url}"`;

    try {
        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000
        });
        return result;
    } catch (e) {
        console.error(`Error executing curl: ${e.message}`);
        return null;
    }
}

/**
 * 获取 bgm.wiki 的 API token
 */
function getBgmToken(cookiesFile) {
    console.error('正在获取 bgm.wiki API token...');

    // 首次访问获取初始 cookies
    curl('https://bgm.wiki/', { cookiesFile });

    // 刷新 token
    curl('https://bgm.wiki/api/public/refresh-token', {
        cookiesFile,
        method: 'POST'
    });

    // 读取 cookies 文件获取 token
    try {
        const content = fs.readFileSync(cookiesFile, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('anime_schedule_public_api_token')) {
                const parts = line.split('\t');
                return parts[parts.length - 1].trim();
            }
        }
    } catch (e) {
        console.error(`Error reading cookies: ${e.message}`);
    }

    return null;
}

/**
 * 根据季节获取日期范围
 */
function getSeasonDateRange(season, year) {
    const ranges = {
        '冬': [`${year - 1}-12-01`, `${year}-03-01`],
        '春': [`${year}-03-01`, `${year}-06-01`],
        '夏': [`${year}-06-01`, `${year}-09-01`],
        '秋': [`${year}-09-01`, `${year}-12-01`]
    };
    return ranges[season] || [null, null];
}

/**
 * 日期字符串转毫秒时间戳
 */
function dateToTimestamp(dateStr) {
    return new Date(dateStr + 'T00:00:00Z').getTime();
}

/**
 * 获取一周的播出数据
 */
function fetchWeekData(fromTs, toTs, token, cookiesFile) {
    const url = `https://bgm.wiki/api/schedule/window?from=${fromTs}&to=${toTs}&lang=zh-CN`;
    const data = curl(url, {
        cookiesFile,
        headers: { 'x-public-api-token': token }
    });

    if (data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * 获取整个时间范围的播出数据
 */
function fetchAllSchedule(fromDate, toDate, token, cookiesFile) {
    const allEvents = [];
    const fromTs = dateToTimestamp(fromDate);
    const toTs = dateToTimestamp(toDate);
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    console.error(`正在获取 ${fromDate} 到 ${toDate} 的播出数据...`);

    let currentTs = fromTs;
    let weekNum = 0;

    while (currentTs < toTs) {
        const weekEnd = Math.min(currentTs + weekMs, toTs);
        weekNum++;
        console.error(`  获取第 ${weekNum} 周数据...`);

        const data = fetchWeekData(currentTs, weekEnd, token, cookiesFile);
        if (data && data.events) {
            allEvents.push(...data.events);
        }

        currentTs = weekEnd;
    }

    console.error(`共获取 ${allEvents.length} 条播出记录`);
    return allEvents;
}

/**
 * 去重，选择播出时间
 * 逻辑：1. 选择当日最早播出的时间与平台
 *       2. 如果不同周数同一平台的时间有所更改，取最常见的播出时间
 */
function deduplicateAnime(events) {
    // 按 workId 分组
    const byWorkId = new Map();
    for (const event of events) {
        const workId = event.workId;
        if (!workId) continue;
        if (!byWorkId.has(workId)) {
            byWorkId.set(workId, []);
        }
        byWorkId.get(workId).push(event);
    }

    const result = [];
    for (const [workId, eventList] of byWorkId) {
        // 按平台分组
        const byPlatform = new Map();
        for (const e of eventList) {
            const platform = e.platform?.text || '';
            if (!byPlatform.has(platform)) {
                byPlatform.set(platform, []);
            }
            byPlatform.get(platform).push(e);
        }

        // 对每个平台，选择最常见的播出时间
        const platformBest = [];
        for (const [platform, platformEvents] of byPlatform) {
            // 统计每个时间的出现次数
            const timeCount = new Map();
            for (const e of platformEvents) {
                timeCount.set(e.eventAt, (timeCount.get(e.eventAt) || 0) + 1);
            }

            // 选择最常见的时间
            let bestTime = null;
            let bestCount = 0;
            for (const [time, count] of timeCount) {
                if (count > bestCount || (count === bestCount && (!bestTime || time < bestTime))) {
                    bestCount = count;
                    bestTime = time;
                }
            }

            const bestEvent = platformEvents.find(e => e.eventAt === bestTime);
            if (bestEvent) {
                platformBest.push(bestEvent);
            }
        }

        // 选择当日最早播出的平台
        platformBest.sort((a, b) => {
            const timeA = new Date(a.eventAt);
            const timeB = new Date(b.eventAt);
            return timeA - timeB;
        });

        if (platformBest.length > 0) {
            result.push(platformBest[0]);
        }
    }

    console.error(`去重后得到 ${result.length} 部独立动画`);
    return result;
}

/**
 * 解析用户的新番表文件
 */
function parseUserAnimeList(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const animeList = [];
    let current = null;

    for (const line of lines) {
        const m = line.match(/^(\d+)\.\s+(.+)/);
        if (m) {
            if (current) {
                animeList.push(current);
            }
            current = {
                num: parseInt(m[1]),
                jpTitle: m[2].trim(),
                bgmId: null,
                info: []
            };
        } else if (current && line.trim()) {
            current.info.push(line.trim());

            // 提取 BGM ID（支持多种格式）
            const bgmIdMatch = line.match(/BGM\s*ID[:\s]*(\d+)/i) ||
                              line.match(/bgm\.tv\/subject\/(\d+)/i) ||
                              line.match(/bgmId[:\s]*(\d+)/i) ||
                              line.match(/bangumi[:\s]*(\d+)/i);
            if (bgmIdMatch) {
                current.bgmId = parseInt(bgmIdMatch[1]);
            }
        }
    }

    if (current) {
        animeList.push(current);
    }

    return animeList;
}

/**
 * 计算标题匹配度
 */
function matchScore(userJp, bgmJp, bgmMain) {
    const normalize = (s) => (s || '').replace(/[\s　]/g, '').toLowerCase();
    const u = normalize(userJp);
    const bj = normalize(bgmJp);
    const bm = normalize(bgmMain);

    if (u === bj || u === bm) return 100;
    if (bj.includes(u) || u.includes(bj)) return 90;
    if (bm.includes(u) || u.includes(bm)) return 80;

    // 部分匹配
    const uChars = u.split('');
    let matched = 0;
    for (const c of uChars) {
        if (bj.includes(c) || bm.includes(c)) matched++;
    }
    return Math.floor((matched / uChars.length) * 70);
}

/**
 * 匹配用户列表和 bgm.wiki 数据
 */
function matchAnime(userList, bgmData) {
    const results = [];

    // 预处理：建立 bgmId 到数据的映射
    const bgmIdMap = new Map();
    for (const ba of bgmData) {
        if (ba.bgmId) {
            bgmIdMap.set(ba.bgmId, ba);
        }
    }

    for (const ua of userList) {
        let bestMatch = null;
        let bestScore = 0;
        let matchMethod = '';

        // 优先使用 bgmId 精确匹配
        if (ua.bgmId && bgmIdMap.has(ua.bgmId)) {
            bestMatch = bgmIdMap.get(ua.bgmId);
            bestScore = 100;
            matchMethod = 'bgmId精确匹配';
        } else {
            // 降级到标题匹配
            for (const ba of bgmData) {
                const titles = ba.titles || {};
                const score = matchScore(ua.jpTitle, titles.japan, titles.main);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = ba;
                    matchMethod = '标题模糊匹配';
                }
            }
        }

        // 提取用户文件中的信息
        let cnName = '';
        let userDate = '';
        for (const info of ua.info) {
            if (info.startsWith('中文名:')) {
                cnName = info.replace('中文名:', '').trim();
            } else if (info.startsWith('放送日期:')) {
                userDate = info.replace('放送日期:', '').trim();
            }
        }

        const result = {
            num: ua.num,
            jpTitle: ua.jpTitle,
            cnName,
            userDate,
            bgmBroadcast: '未找到',
            bgmPlatform: '未找到',
            bgmPlatformUrl: '',
            bgmAreas: '',
            matchInfo: '未匹配'
        };

        if (bestMatch && bestScore >= 60) {
            // 转换 UTC 到 JST (UTC+9)
            const eventDate = new Date(bestMatch.eventAt);
            const jstMs = eventDate.getTime() + 9 * 60 * 60 * 1000;
            const jstDate = new Date(jstMs);

            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            let weekday = weekdays[jstDate.getUTCDay()];

            let hours = jstDate.getUTCHours();
            const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');

            // 使用30小时制：深夜时段(0:00~5:00)扩展为25:00~30:00
            // 同时将星期回退到前一天（与bgm.wiki显示一致）
            if (hours >= 0 && hours < 6) {
                hours += 24;
                // 回退星期：前一天
                const prevDay = new Date(jstMs - 24 * 60 * 60 * 1000);
                weekday = weekdays[prevDay.getUTCDay()];
            }

            result.bgmBroadcast = `${String(hours).padStart(2, '0')}:${minutes} (${weekday})`;
            result.bgmPlatform = bestMatch.platform?.text || '';
            result.bgmPlatformUrl = bestMatch.platform?.url || '';
            result.bgmAreas = (bestMatch.areasPrimary || []).map(a => a.label).join(', ');
            result.matchInfo = matchMethod;
        } else if (bestScore > 0) {
            result.matchInfo = `可能不准确 (匹配度:${bestScore}%)`;
        }

        results.push(result);
    }

    return results;
}

/**
 * 生成输出文本
 * @returns {Object} { matched: string, unmatched: string }
 */
function generateOutput(results, fromDate, toDate, originalContent) {
    const matchedLines = [];
    const unmatchedLines = [];

    // 未匹配文件头
    unmatchedLines.push('2026年新番 未匹配条目');
    unmatchedLines.push('数据来源: https://bgm.wiki/');
    unmatchedLines.push(`时间范围: ${fromDate} ~ ${toDate}`);
    unmatchedLines.push(`生成日期: ${new Date().toISOString().slice(0, 10)}`);
    unmatchedLines.push('='.repeat(60));
    unmatchedLines.push('');
    unmatchedLines.push('以下动画在 bgm.wiki 中未找到播出信息：');
    unmatchedLines.push('');

    let foundCount = 0;
    let notFoundCount = 0;

    for (const r of results) {
        if (r.bgmBroadcast !== '未找到') {
            foundCount++;
        } else {
            notFoundCount++;
            unmatchedLines.push(`${r.num}. ${r.jpTitle}`);
            if (r.cnName) unmatchedLines.push(`   中文名: ${r.cnName}`);
            unmatchedLines.push('');
        }
    }

    // 已匹配文件：保留已匹配条目的原有信息，在末尾添加播出时间与平台
    const originalLines = originalContent.split('\n');
    let currentNum = 0;
    let currentResult = null;
    let inMatchedEntry = false;

    for (let i = 0; i < originalLines.length; i++) {
        const line = originalLines[i];
        const titleMatch = line.match(/^(\d+)\.\s+(.+)/);

        if (titleMatch) {
            // 新条目开始，先处理上一个条目的播出信息
            if (inMatchedEntry && currentResult) {
                matchedLines.push(`   播出时间(JST): ${currentResult.bgmBroadcast}`);
                matchedLines.push(`   播放平台: ${currentResult.bgmPlatform}`);
            }

            currentNum = parseInt(titleMatch[1]);
            currentResult = results.find(r => r.num === currentNum);

            // 检查是否已匹配
            if (currentResult && currentResult.bgmBroadcast !== '未找到') {
                inMatchedEntry = true;
                // 条目之间加空行
                if (matchedLines.length > 0) {
                    matchedLines.push('');
                }
                matchedLines.push(line);
            } else {
                inMatchedEntry = false;
            }
            continue;
        }

        // 只输出已匹配条目的原始行（跳过空行）
        if (inMatchedEntry && line.trim() !== '') {
            matchedLines.push(line);
        }
    }

    // 处理最后一个条目
    if (inMatchedEntry && currentResult) {
        matchedLines.push(`   播出时间(JST): ${currentResult.bgmBroadcast}`);
        matchedLines.push(`   播放平台: ${currentResult.bgmPlatform}`);
    }

    // 未匹配文件尾
    unmatchedLines.push('='.repeat(60));
    unmatchedLines.push(`统计: 共${notFoundCount}部动画未找到播出信息`);

    return {
        matched: matchedLines.join('\n'),
        unmatched: unmatchedLines.join('\n')
    };
}

/**
 * 解析命令行参数
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {
        input: null,
        output: null,
        season: null,
        year: 2026,
        fromDate: null,
        toDate: null
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':
                params.input = args[++i];
                break;
            case '--output':
                params.output = args[++i];
                break;
            case '--season':
                params.season = args[++i];
                break;
            case '--year':
                params.year = parseInt(args[++i]);
                break;
            case '--from-date':
            case '--from':
                params.fromDate = args[++i];
                break;
            case '--to-date':
            case '--to':
                params.toDate = args[++i];
                break;
        }
    }

    return params;
}

/**
 * 主函数
 */
function main() {
    const params = parseArgs();

    if (!params.input) {
        console.error('错误: 必须指定 --input 参数');
        process.exit(1);
    }

    // 确定时间范围
    let fromDate, toDate;
    if (params.season) {
        [fromDate, toDate] = getSeasonDateRange(params.season, params.year);
        if (!fromDate) {
            console.error(`错误: 无效的季节 ${params.season}`);
            process.exit(1);
        }
    } else if (params.fromDate) {
        fromDate = params.fromDate;
        toDate = params.toDate;
        if (!toDate) {
            const fromDt = new Date(fromDate);
            fromDt.setDate(fromDt.getDate() + 90);
            toDate = fromDt.toISOString().slice(0, 10);
        }
    } else {
        console.error('错误: 必须指定 --season 或 --from-date');
        process.exit(1);
    }

    const cookiesFile = path.join(TEMP_DIR, 'cookies.txt');

    try {
        // 获取 bgm.wiki token
        const token = getBgmToken(cookiesFile);
        if (!token) {
            console.error('错误: 无法获取 API token');
            process.exit(1);
        }

        // 获取播出数据
        const events = fetchAllSchedule(fromDate, toDate, token, cookiesFile);

        // 去重
        const bgmData = deduplicateAnime(events);

        // 解析用户新番表
        console.error('正在解析新番表...');
        const userList = parseUserAnimeList(params.input);
        console.error(`新番表包含 ${userList.length} 部动画`);

        // 匹配数据
        console.error('正在匹配数据...');
        const results = matchAnime(userList, bgmData);

        // 读取原始文件内容
        const originalContent = fs.readFileSync(params.input, 'utf-8');

        // 生成输出
        const output = generateOutput(results, fromDate, toDate, originalContent);

        // 确定输出路径
        let outputPath = params.output;
        if (!outputPath) {
            const baseName = path.splitext(params.input)[0];
            outputPath = `${baseName}_bgm_info.txt`;
        }

        // 生成未匹配文件路径
        const unmatchedPath = outputPath.replace('.txt', '_未匹配.txt');

        // 写入文件
        fs.writeFileSync(outputPath, output.matched, 'utf-8');
        fs.writeFileSync(unmatchedPath, output.unmatched, 'utf-8');

        console.error(`\n完成!`);
        console.error(`已匹配: ${outputPath}`);
        console.error(`未匹配: ${unmatchedPath}`);

        // 统计
        const found = results.filter(r => r.bgmBroadcast !== '未找到').length;
        const notFound = results.filter(r => r.bgmBroadcast === '未找到').length;
        console.error(`已找到: ${found}/${results.length}`);
        console.error(`未找到: ${notFound}/${results.length}`);

    } finally {
        // 清理临时文件
        try {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        } catch (e) {
            // 忽略清理错误
        }
    }
}

// 运行主函数
main();
