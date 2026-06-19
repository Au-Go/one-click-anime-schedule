---
name: anime-schedule-chart
description: 根据新番信息文件生成播出时间表（HTML+PNG），自动识别季节并匹配对应配色模板
allowed-tools: Bash(node:*),Bash(npx:*),Bash(mkdir:*),Read,Write,Edit
---

# 新番播出时间表生成器

根据 `*_bgm_info.txt` 格式的新番信息文件，自动生成播出时间表，输出 HTML 和 PNG 两种格式。

## 使用方式

```bash
# 基本用法（自动识别季节）
node .claude/skills/anime-schedule-chart/generate.js --input "新番信息文件路径"

# 指定输出目录
node .claude/skills/anime-schedule-chart/generate.js --input "文件路径" --output "输出目录"

# 指定季节（覆盖自动识别）
node .claude/skills/anime-schedule-chart/generate.js --input "文件路径" --season 夏

# 指定年份
node .claude/skills/anime-schedule-chart/generate.js --input "文件路径" --year 2027

# 仅生成 HTML（不生成 PNG）
node .claude/skills/anime-schedule-chart/generate.js --input "文件路径" --html-only
```

## 参数说明

| 参数 | 说明 | 必需 | 默认值 |
|------|------|------|--------|
| `--input` | 新番信息文件路径（bgm_info.txt 格式） | 是 | - |
| `--output` | 输出目录 | 否 | 与输入文件同目录 |
| `--season` | 季节（冬/春/夏/秋） | 否 | 自动识别 |
| `--year` | 年份（如 2026） | 否 | 自动识别 |
| `--html-only` | 仅生成 HTML，不生成 PNG | 否 | false |

## 输入文件格式

输入文件需为 `*_bgm_info.txt` 格式，每条动画信息包含以下字段：

```
1. 动画标题
   BGM ID: 123456
   中文名: 中文名称
   类型: 漫画改/小说改/原创/游戏改/泡面
   动画制作: 制作公司名称
   官方网站: https://...
   放送日期: 2026年4月5日
   播出时间(JST): 22:00 (周三)
   播放平台: TOKYO MX
```

### 必需字段

| 字段 | 说明 | 示例 |
|------|------|------|
| 标题（首行） | 动画名称 | `Re:ゼロから始める異世界生活` |
| `放送日期` | 首播日期 | `2026年4月8日` |
| `播出时间(JST)` | JST 播出时间及星期 | `22:00 (周三)` |
| `播放平台` | 首播渠道 | `AT-X` |
| `类型` | 改编类型 | `小说改` |

### 可选字段

| 字段 | 说明 |
|------|------|
| `BGM ID` | Bangumi ID |
| `中文名` | 中文译名 |
| `动画制作` | 制作公司 |
| `官方网站` | 官网 URL |

## 季节自动识别规则

根据 `放送日期` 中的月份自动判断：

| 季节 | 月份范围 | 配色主题 |
|------|----------|----------|
| 冬 | 12月、1月、2月 | 冰雪蓝（#1a237e） |
| 春 | 3月、4月、5月 | 樱花粉红（#c0392b） |
| 夏 | 6月、7月、8月 | 海洋蓝（#1565c0） |
| 秋 | 9月、10月、11月 | 枫叶橙（#bf360c） |

## 输出文件

### HTML 文件
- 文件名：`{年份}年{季节}番播出时间表.html`
- 示例：`26年春季番播出时间表.html`

### PNG 文件
- 文件名：`{年份}年{季节}番播出时间表.png`
- 使用 Playwright 截图生成
- 需要已安装 `playwright` 依赖

## 表格排列规则

1. **主排序**：按曜日（日→月→火→水→木→金→土）
2. **次排序**：同曜日内按播出时间（JST 三十小时制）从早到晚
3. **单元格合并**：日期和时间列中，相邻且内容相同的单元格自动合并

## 表格列定义

| 列名 | 宽度 | 说明 |
|------|------|------|
| 曜日 | 56px | rowspan 合并 |
| 日期 | 1.6em | 相邻同值合并 |
| 时间 | 1.6em | 相邻同值合并 |
| 番名 | 10em | 动画标题 |
| 中文名 | 10em | 中文译名 |
| 分类 | 1.6em | 漫画改/小说改等 |
| 动画制作公司 | 7em | 制作公司 |
| 首播渠道 | 6em | 播放平台 |

## 底栏信息

- UTC+9 时区标注
- 三十小时制标注
- 信息来源：bgm.tv / bgm.wiki
- 收录部数统计
- 统计截止日期（制表当日）
- 分类统计徽章（漫画改/小说改/原创/泡面/游戏改）

## 四季配色方案

### 春（樱花粉红）
- 标题栏：`#c0392b → #e74c3c → #f1948a`
- 曜日格：`#f8bbd0`，边框 `#e91e63`

### 夏（海洋蓝）
- 标题栏：`#1565c0 → #1e88e5 → #64b5f6`
- 曜日格：`#b3e5fc`，边框 `#0288d1`

### 秋（枫叶橙）
- 标题栏：`#bf360c → #e65100 → #ff8a65`
- 曜日格：`#ffcc80`，边框 `#ef6c00`

### 冬（冰雪蓝）
- 标题栏：`#1a237e → #283593 → #5c6bc0`
- 曜日格：`#c5cae9`，边框 `#3949ab`

## 示例

```bash
# 生成 2026 年春季播出时间表
node .claude/skills/anime-schedule-chart/generate.js \
  --input "E:/种子/Anime/番剧表/26年/charts/春番_2026_bgm_info.txt"

# 生成 2027 年夏季播出时间表，指定输出目录
node .claude/skills/anime-schedule-chart/generate.js \
  --input "夏番_2027_bgm_info.txt" \
  --output "./output" \
  --season 夏 \
  --year 27
```

## 依赖

- Node.js
- Playwright（用于 PNG 截图，`--html-only` 时不需要）

## 注意事项

- 署名固定为 **By AttoUmani**
- 信息来源标注为 **bgm.tv / bgm.wiki**
- 播出时间为 JST（UTC+9），采用三十小时制
- 超过次日 5:00 的时间显示为前一天的 25:00~30:00
