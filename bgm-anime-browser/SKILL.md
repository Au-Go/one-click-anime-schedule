---
name: bgm-anime-browser
description: 使用bgm.tv API查询指定月份的动画条目，筛选并汇总动画信息
allowed-tools: Bash(python:*)
---

# BGM 动画查询工具

使用 bgm.tv API 查询指定月份/季节的动画条目，支持自定义筛选条件。

## 使用方式

通过 Bash 调用 Python 脚本执行查询：

```bash
py .claude/skills/bgm-anime-browser/query.py --year 2026 --season 夏
```

## 认证（可选）

脚本从环境变量 `BGM_TOKEN` 读取 bgm.tv Access Token。匿名可正常使用，设置 Token 可获得更高 API 限额。

设置方式（当前会话）：
```bash
export BGM_TOKEN=你的Token
```

永久设置（Windows）：
```bash
setx BGM_TOKEN "你的Token"
```

## 季节定义

| 季节 | 月份范围 |
|------|----------|
| 冬（1月） | 上一年12月 + 本年1、2月 |
| 春（4月） | 本年3、4、5月 |
| 夏（7月） | 本年6、7、8月 |
| 秋（10月） | 本年9、10、11月 |

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--year` | 年份 | 2026 |
| `--month` | 单个月份 | 当前月份 |
| `--months` | 多个月份（逗号分隔） | 无 |
| `--season` | 季节（冬/春/夏/秋） | 无 |
| `--exclude-tags` | 排除的标签 | MV,剧场版,电影,动态漫画 |
| `--require-tag` | 必须包含的标签 | 日本 |
| `--min-eps` | 最小章节数（排除≤1集的条目） | 1 |
| `--output` | 输出文件路径 | 标准输出 |

## 输出信息

每个条目包含：
- 条目名称（日文）
- BGM ID（bgm.tv 条目ID）
- 中文名
- 动画制作
- 类型（漫画改/小说改/原创/游戏改/泡面）
- 官方网站
- 放送日期（精确到日，如"2026年7月2日"）

### 类型判定规则

优先按标签判定为：漫画改、小说改、原创、游戏改。以下情况统一归为**泡面**：
- 标签含"泡面"或"泡面番"
- 标签含"短片"
- 无任何类型标签

### NSFW 过滤

API 返回 `nsfw: true` 的条目始终不收录。

## 示例

```bash
# 查询2026年春季新番（3-5月）
py .claude/skills/bgm-anime-browser/query.py --year 2026 --season 春

# 查询2026年夏季新番（6-8月）
py .claude/skills/bgm-anime-browser/query.py --year 2026 --season 夏

# 查询2026年7月的动画
py .claude/skills/bgm-anime-browser/query.py --year 2026 --month 7

# 自定义筛选条件并输出到文件
py .claude/skills/bgm-anime-browser/query.py --year 2026 --season 夏 --exclude-tags "MV,剧场版,电影,短片,动态漫画,总集编" --require-tag "日本" --min-tags 10 --output anime_list.txt
```
