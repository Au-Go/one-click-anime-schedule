# 动画放送时间表生成脚本

从 [Bangumi](https://bgm.tv/) 目录读取指定季度的动画条目，自动匹配 [bgm.wiki](https://bgm.wiki/) 的放送时间，生成一份可读的 HTML / PNG 新番时间表。

## 特性

- 按季度批量获取新番列表，无需手工整理
- 从 Bangumi 目录动态解析季度对应的目录 ID，季度切换零配置
- 自动匹配 bgm.wiki 的放送时间与平台（优先 bgmId 精确匹配，其次标题模糊匹配）
- 支持代理（命令行、环境变量、Windows 系统代理）
- 输出 HTML 时间表，可选生成 PNG 图片
- 交互式 / 非交互式两种运行模式
- 首次运行可选择保存 BGM Token 与输出目录，之后一键复用

## 数据来源

| 用途 | 来源 |
| --- | --- |
| 动画条目、类型、制作公司 | [bgm.tv](https://bgm.tv/) |
| 放送时间、放送平台 | [bgm.wiki](https://bgm.wiki/) |

## 环境要求

- **Node.js 14 及以上**
- 能够访问 `api.bgm.tv` 和 `bgm.wiki`（国内网络通常需要代理）
- 可选：`playwright`（用于生成 PNG，不装则仅输出 HTML）

## 安装

```bash
git clone https://github.com/Au-Go/one-click-anime-schedule.git
cd one-click-anime-schedule
```

脚本仅依赖 Node 内置模块，克隆后即可运行。若要生成 PNG：

```bash
npm install playwright
```

> 使用 `channel: 'msedge'` 时无需额外下载 Chromium，可直接调用系统自带 Edge。

## 使用方法

### 交互模式

```bash
node one-click.js
```

脚本会依次询问：

1. 季度（推荐下一季 / 上一季 / 手动输入）
2. 是否使用原有 Token（如果有）
3. 是否使用原有输出目录（如果有）

### 非交互模式

```bash
node one-click.js -y 2026 -s 秋 -o ./output
```

## 命令行参数

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--year <year>` | `-y` | 年份，例如 `2026` |
| `--season <season>` | `-s` | 季节，可选 `冬` `春` `夏` `秋` |
| `--output <dir>` | `-o` | 输出目录 |
| `--html-only` | | 只生成 HTML，不生成 PNG |
| `--proxy <host:port>` | | 指定代理，或 `--proxy auto` 自动检测 |
| `--no-proxy` | | 禁用代理，直连 |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `BGM_TOKEN` | Bangumi Access Token，可提升 API 限额并访问受限目录 |

若设置了 `BGM_TOKEN`，脚本会优先使用它，并跳过 Token 询问。

Token 获取地址：<https://next.bgm.tv/demo/access-token>

PowerShell 临时设置：

```powershell
$env:BGM_TOKEN="your_token_here"
node one-click.js
```

## 配置文件

脚本在**当前工作目录**下自动维护两个文件：

| 文件 | 内容 |
| --- | --- |
| `default_path.txt` | 上一次使用的输出目录 |
| `bgm_token.txt` | 保存的 BGM Token |

两个文件相互独立，可以单独删除其中一个以重置对应设置。

## 输出文件

运行结束后，输出目录中会生成以下文件：

| 文件 | 说明 |
| --- | --- |
| `anime_list_<year><season>.txt` | 从目录抓取的动画清单 |
| `anime_merged_<year><season>.txt` | 已匹配放送时间的清单 |
| `anime_merged_<year><season>_未匹配.txt` | 未匹配到放送时间的条目 |
| `<yy>年<season>季放送时间表.html` | 最终 HTML 时间表 |
| `<yy>年<season>季放送时间表.png` | 最终 PNG 时间表（需 playwright） |

## 工作流程

```
Step 1  访问目录 104044，从简介中解析当前季度对应的目录 ID
        抓取目标目录下全部条目，逐条补全详情与制作公司
Step 2  从 bgm.wiki 分段获取整个季度的放送事件
        按 bgmId / 标题匹配到每个动画
Step 3  解析匹配结果，按星期与放送时间排序，生成 HTML 与 PNG
```

## 常见问题

### 404 Not Found

- 该目录可能是受限目录（包含 NSFW 条目）。Bangumi 对这类目录统一返回 404，而不是 403。
- 确认 `BGM_TOKEN` 已正确设置，账号有访问受限内容的权限（通常需要注册满一定时长）。
- 检查代理是否已放行 `api.bgm.tv`。

### 无法连接 / 超时

- 检查代理是否正常工作：`curl -x http://127.0.0.1:7890 https://api.bgm.tv/v0/me -H "Authorization: Bearer <token>"`
- 若使用 `--no-proxy`，国内网络下通常无法访问 `api.bgm.tv`。

### 所有条目的类型都是"泡面"

- 说明部分条目未能获取到 `tags`。脚本已对每个条目调用详情接口补全，若仍大量出现，请提交 issue 并附上调试日志。

### 跳过 PNG

- 未安装 `playwright`。安装后重新运行即可：`npm install playwright`。

## 项目结构

```
.
├── one-click.js          # 主脚本
├── default_path.txt      # 自动生成，保存输出目录
└── bgm_token.txt         # 自动生成，保存 BGM Token
```

## 致谢

- [Bangumi](https://bgm.tv/) — 动画资料与条目目录
- [bgm.wiki](https://bgm.wiki/) — 放送时间数据

## License

MIT
