# -*- coding: utf-8 -*-
"""
BGM 动画查询工具
使用 bgm.tv API 查询指定月份的动画条目，筛选并汇总动画信息。
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime

# Access Token: 优先从环境变量 BGM_TOKEN 读取，未设置则留空（匿名访问）
BGM_TOKEN = os.environ.get('BGM_TOKEN', '')


def fetch_anime_entries(year, month, limit=50, offset=0):
    """从 bgm.tv API 获取动画条目"""
    url = f"https://api.bgm.tv/v0/subjects?type=2&sort=date&year={year}&month={month}&limit={limit}&offset={offset}"

    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0')
        if BGM_TOKEN:
            req.add_header('Authorization', f'Bearer {BGM_TOKEN}')
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('data', [])
    except Exception as e:
        print(f"Error fetching data for {year}/{month}: {e}", file=sys.stderr)
        return []


def fetch_all_entries(year, month):
    """获取指定月份的所有动画条目"""
    all_entries = []
    offset = 0
    limit = 50

    while True:
        entries = fetch_anime_entries(year, month, limit, offset)
        if not entries:
            break
        all_entries.extend(entries)
        offset += limit
        if len(entries) < limit:
            break

    return all_entries


def fetch_episode_count(subject_id):
    """通过episodes API获取实际集数"""
    url = f"https://api.bgm.tv/v0/episodes?subject_id={subject_id}&limit=1"
    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        if BGM_TOKEN:
            req.add_header('Authorization', f'Bearer {BGM_TOKEN}')
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('total', 0)
    except:
        return 0


def fetch_production_from_persons(subject_id):
    """通过 persons API 获取动画制作公司"""
    url = f"https://api.bgm.tv/v0/subjects/{subject_id}/persons"
    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        if BGM_TOKEN:
            req.add_header('Authorization', f'Bearer {BGM_TOKEN}')
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode('utf-8'))
            producers = [p.get('name', '') for p in data if p.get('relation') == '动画制作']
            return ', '.join(producers) if producers else ''
    except:
        return ''


def filter_entries(entries, exclude_tags, require_tag, min_eps):
    """筛选条目"""
    filtered = []

    for entry in entries:
        # 排除 NSFW 条目（API 返回的 nsfw 字段）
        if entry.get('nsfw', False):
            continue

        tags = entry.get('tags', [])
        tag_names = [t.get('name', '') for t in tags]

        # 通过episodes API获取集数（total字段），排除≤min_eps的条目
        if min_eps > 0:
            eps = fetch_episode_count(entry.get('id', 0))
            if eps <= min_eps:
                continue

        # 检查排除标签
        has_excluded = any(tag in exclude_tags for tag in tag_names)
        if has_excluded:
            continue

        # 检查必须包含的标签
        if require_tag and require_tag not in tag_names:
            continue

        filtered.append(entry)

    return filtered


def get_season_months(season):
    """根据季节返回对应的月份列表"""
    seasons = {
        '冬': [12, 1, 2],  # 上一年12月 + 本年1、2月
        '春': [3, 4, 5],
        '夏': [6, 7, 8],
        '秋': [9, 10, 11]
    }
    return seasons.get(season, [])


def extract_entry_info(entry, year, month):
    """提取条目信息"""
    infobox = entry.get('infobox', [])
    tags = entry.get('tags', [])

    # 提取中文名
    name_cn = ''
    for item in infobox:
        if item.get('key') == '中文名':
            name_cn = item.get('value', '')
            break

    # 提取动画制作（infobox 优先，无则从 persons API 获取）
    production = ''
    for item in infobox:
        if item.get('key') == '动画制作':
            production = item.get('value', '')
            break
    if not production:
        production = fetch_production_from_persons(entry.get('id', 0))

    # 提取官方网站
    website = ''
    for item in infobox:
        if item.get('key') == '官方网站':
            website = item.get('value', '')
            break

    # 提取类型（泡面番优先）
    type_tags = ['漫画改', '小说改', '原创', '游戏改']
    anim_type = ''
    max_count = 0
    for tag in tags:
        if tag.get('name') in type_tags and tag.get('count', 0) > max_count:
            max_count = tag.get('count', 0)
            anim_type = tag.get('name', '')

    # 泡面番：含"泡面"或"短片"标签，或无类型 → 归为泡面
    tag_names = [t.get('name', '') for t in tags]
    if not anim_type or any('泡面' in t or '短片' in t for t in tag_names):
        anim_type = '泡面'

    # 提取精确日期
    date_str = entry.get('date', '')
    if date_str:
        # 格式: "2026-07-02" -> "2026年7月2日"
        try:
            parts = date_str.split('-')
            precise_date = f"{parts[0]}年{int(parts[1])}月{int(parts[2])}日"
        except:
            precise_date = f"{year}年{month}月"
    else:
        precise_date = f"{year}年{month}月"

    return {
        'bgm_id': entry.get('id', ''),
        'name': entry.get('name', ''),
        'name_cn': name_cn,
        'anim_type': anim_type,
        'production': production,
        'website': website,
        'date': precise_date
    }


def main():
    parser = argparse.ArgumentParser(description='BGM 动画查询工具')
    parser.add_argument('--year', type=int, default=2026, help='年份')
    parser.add_argument('--month', type=int, default=None, help='月份')
    parser.add_argument('--months', type=str, default=None, help='多个月份，逗号分隔')
    parser.add_argument('--season', type=str, default=None, help='季节：冬(1月)/春(4月)/夏(7月)/秋(10月)')
    parser.add_argument('--exclude-tags', type=str, default='MV,剧场版,电影,动态漫画', help='排除的标签')
    parser.add_argument('--require-tag', type=str, default='日本', help='必须包含的标签')
    parser.add_argument('--min-eps', type=int, default=1, help='最小章节数（默认1,排除≤1集条目）')
    parser.add_argument('--output', type=str, default=None, help='输出文件路径')

    args = parser.parse_args()

    # 解析排除标签
    exclude_tags = [t.strip() for t in args.exclude_tags.split(',')]

    # 确定要查询的月份
    if args.season:
        months = get_season_months(args.season)
    elif args.months:
        months = [int(m.strip()) for m in args.months.split(',')]
    elif args.month:
        months = [args.month]
    else:
        months = [datetime.now().month]

    all_entries = []
    for month in months:
        # 处理冬季跨年情况
        fetch_year = args.year
        if args.season == '冬' and month == 12:
            fetch_year = args.year - 1

        print(f"Fetching {fetch_year}/{month}...", file=sys.stderr)
        entries = fetch_all_entries(fetch_year, month)
        filtered = filter_entries(entries, exclude_tags, args.require_tag, args.min_eps)

        for entry in filtered:
            info = extract_entry_info(entry, fetch_year, month)
            all_entries.append(info)

    # 生成输出
    output = []
    for i, entry in enumerate(all_entries, 1):
        output.append(f"{i}. {entry['name']}")
        output.append(f"   BGM ID: {entry['bgm_id']}")
        if entry['name_cn']:
            output.append(f"   中文名: {entry['name_cn']}")
        if entry['anim_type']:
            output.append(f"   类型: {entry['anim_type']}")
        if entry['production']:
            output.append(f"   动画制作: {entry['production']}")
        if entry['website']:
            output.append(f"   官方网站: {entry['website']}")
        output.append(f"   放送日期: {entry['date']}")
        output.append("")

    # 添加统计信息
    output.append("===统计信息===")
    output.append(f"总计: {len(all_entries)}个条目")

    type_count = {}
    for entry in all_entries:
        t = entry['anim_type'] or '未分类'
        type_count[t] = type_count.get(t, 0) + 1
    output.append("类型分布:")
    for t, count in type_count.items():
        output.append(f"- {t}: {count}个")

    date_count = {}
    for entry in all_entries:
        d = entry['date']
        date_count[d] = date_count.get(d, 0) + 1
    output.append("\n放送日期分布:")
    for d, count in sorted(date_count.items()):
        output.append(f"- {d}: {count}个")

    result = '\n'.join(output)

    # 输出到文件或标准输出
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f"Results saved to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == '__main__':
    main()
