---
name: one-click-anime-schedule
description: 一键生成新番播出时间表：自动收集情报、整合播出信息、生成图表（独立版本）
allowed-tools: Bash(node:*),Bash(npx:*),Bash(mkdir:*),Read,Write,Edit
---

# 一键生成新番表（独立版）

完整整合 bgm.tv 查询、bgm.wiki 播出信息、图表生成功能，无需依赖其他skills脚本。

## 工作流程

1. 确定要生成哪个季度的新番表
2. 确定文件保存位置
3. 从 bgm.tv API 收集新番情报
4. 从 bgm.wiki 获取播出时间和平台信息
5. 生成播出时间表（HTML+PNG）

## 使用方式

### Agent 调用（非交互）

当用户告诉 agent 生成某个季度的新番表时，agent 应使用以下命令：

```bash
# 指定季度和输出目录
node .claude/skills/one-click-anime-schedule/one-click.js --year 2026 --season 夏 --output "E:/种子/Anime/番剧表"

# 使用默认路径（从配置文件读取）
node .claude/skills/one-click-anime-schedule/one-click.js --year 2026 --season 夏
```

**Agent 处理逻辑**：
- 用户说"生成2026年夏季新番表，保存到 E:/xxx" → 传 `--year 2026 --season 夏 --output "E:/xxx"`
- 用户说"生成2026年夏季新番表" → 读取 `default_path.txt` 获取默认路径，传 `--year 2026 --season 夏 --output "默认路径"`
- 用户说"生成2026年夏季新番表，用默认路径" → 同上

### 手动运行（交互式）

```bash
# 弹出菜单选择季度和保存位置
node .claude/skills/one-click-anime-schedule/one-click.js

# 指定季度，仅询问保存位置
node .claude/skills/one-click-anime-schedule/one-click.js --year 2026 --season 夏
```

## 参数说明

| 参数 | 说明 | 必需 | 默认值 |
|------|------|------|--------|
| `--year` / `-y` | 年份（如 2026） | 否 | 交互询问 |
| `--season` / `-s` | 季节（冬/春/夏/秋） | 否 | 交互询问 |
| `--output` / `-o` | 输出目录 | 否 | 配置文件/交互询问 |
| `--html-only` | 仅生成HTML | 否 | false |
| `--proxy` | 代理地址（host:port 或 auto） | 否 | auto（自动检测） |
| `--no-proxy` | 禁用代理，强制直连 | 否 | false |

## 输出文件

所有文件统一保存在用户指定的目录中：

| 文件 | 说明 |
|------|------|
| `anime_list_XXXXX.txt` | 原始新番列表（bgm.tv 数据） |
| `anime_merged_XXXXX.txt` | 整合播出信息后的列表 |
| `anime_merged_XXXXX_未匹配.txt` | 未匹配到播出信息的动画 |
| `XX年X季番播出时间表.html` | HTML 格式时间表 |
| `XX年X季番播出时间表.png` | PNG 格式时间表 |

## 配置管理

- **配置文件位置**：`skills/default_path.txt`
- **首次使用**：询问保存位置并记录
- **后续使用**：显示默认位置，询问是否沿用
- **路径不存在**：提示"路径不存在"并终止操作

## 数量检查

当 bgm.tv 获取的番剧数量少于40部时，提示"大家伙都还没宣呢，晚点再来吧！"并终止操作。

## 依赖

- Node.js（内置 https 模块）
- Playwright（用于 PNG 截图，--html-only 时不需要）

## 注意事项

- 署名固定为 **By AttoUmani**
- 信息来源标注为 **bgm.tv / bgm.wiki**
- 播出时间为 JST（UTC+9），采用三十小时制
- 可通过环境变量 `BGM_TOKEN` 设置 bgm.tv Access Token（提高API限额）
- **代理自动检测**：优先使用 `--proxy` 参数 → 环境变量（HTTP_PROXY 等）→ Windows 系统代理 → 直连
- **制作公司回退**：infobox 无数据时自动查询 bgm.tv persons API 补充
