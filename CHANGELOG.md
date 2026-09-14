# Changelog

## v1.1.7

### 功能

- **管理台新增「关于」页，在线版本更新能力回归**：侧边栏新增「关于」菜单，含系统信息（版本/管理端口/运行平台/配置文件路径）、版本更新、更新日志三个卡片。版本更新对照 npm registry（唯一分发渠道）：「检查更新」查 latest 版本，「安装并重启」二次确认后 `npm install -g @latest` 并由 restart-helper 自动重启服务，前端轮询服务恢复且版本到达目标后自动刷新页面加载新版管理台；提示语状态机覆盖加载中/本地开发模式/检查失败/未检查/发现新版本/已是最新。v1.1.0 移除系统菜单后管理台失去更新入口，后端 update 三件套 API 一直在但无 UI 消费
- **更新日志内嵌管理台并随 npm 包分发**：新增 `GET /admin/api/system/changelog`，changelog-service 显式正则解析包根 CHANGELOG.md（`## vX.Y.Z → ### 分类 → - 条目 → **对比**：链接`）为结构化数据，「关于」页按版本折叠展示（当前版本默认展开并高亮标注、条目粗体强调、版本对比外链）；`files` 白名单补 CHANGELOG.md（v1.1.7 起随包分发），存量旧包无此文件时接口降级 NOT_PACKAGED、前端提示并引导 GitHub 查看

### 修复

- **Header GitHub 链接指向旧组织仓库**：管理台右上角 GitHub 按钮仍指向上游 SIE-Operations-and-Maintenance-Team/ssh-mcp-server，包名 v1.1.5 已迁移 @lzm04521，现修正为 fork 仓库；「关于」页底部同款仓库/Issues/npm 包链接
- **设置页过时提示**：副标题"（管理端口在'系统'页）"引用 v1.1.0 已删除的系统页，移除悬空引用

**对比 v1.1.6**：https://github.com/lzm04521/ssh-mcp-server/compare/v1.1.6...v1.1.7

## v1.1.6

### 重构

- **开机自启改为 VBS 隐藏启动器，不再把 node.exe 路径写进注册表**：HKCU Run 键改为 `wscript.exe //B "%LOCALAPPDATA%\SshMcpServer\autostart.vbs"`（启用时生成）。wscript 为 GUI 子系统进程，登录时**不再弹出终端窗口**——此前 node 控制台程序被 Run 键直接拉起，每次登录弹出可见终端窗口，窗口一旦被关闭常驻服务随之退出，表现为"开机后管理台访问不到"。VBS 运行时动态解析 node：fnm 默认别名（`%APPDATA%\fnm\aliases\default`，node 升级后仍有效）优先，启用时的实路径兜底——此前注册表写死 fnm 版本化路径（`fnm\node-versions\v22.22.3\...`），node 升级即失效。启动输出落 `autostart.log`（与 daemon.log 同目录；不能复用 daemon.log：cmd 的 `>>` 以严格共享模式打开文件，被常驻进程 stdout 句柄持有的 daemon.log 会 sharing violation，隐藏窗口下报错不可见、整条命令静默不执行）
- **常驻服务幂等启动，根治并发拉起的 EADDRINUSE 风暴**：`--admin` 模式启动前先探测目标端口，已有本项目常驻实例则记日志并退出（退出码 0）；探测与 listen 间竞态落败（EADDRINUSE）时再次探测确认后优雅退出。开机自启、多个 MCP 客户端代理的 ensureAdminServer、restart-helper 在登录瞬间并发拉起多实例的互踩（daemon.log 中单次登录 6 条 EADDRINUSE 实录）就此消除
- **daemon 拉起路径一律 realpath 锚定**：npx 代理分离拉起与 restart-helper 重启此前直接用 `process.execPath`/`argv[1]`，fnm multishell 等会话级符号链接随 shell 会话清理变成幽灵路径，daemon 长驻后按原路径自我重启必然失败；现统一 realpath 解析到稳定实路径
- **从临时目录启用自启时明确拒绝**：入口脚本位于 fnm multishell / npx 缓存（`_npx`）等会话级/缓存级路径时，启用开机自启直接报错并提示改用 `npm install -g`，不再写入重启后必然失效的启动项

**对比 v1.1.5**：https://github.com/lzm04521/ssh-mcp-server/compare/v1.1.5...v1.1.6

## v1.1.5

### 功能

- **包名迁移至个人 scope `@lzm04521`**：npm 包由 `@keysqiu/ssh-mcp-server` 迁移为 `@lzm04521/ssh-mcp-server`（fork 独立分发），管理台在线更新检测/升级同步指向新包名；README、迁移指南与 skills 中所有安装命令同步更新

### 变更

- **移除 Windows 桌面壳（Tauri）**：删除 `src-tauri/` 桌面应用、Tauri 构建脚本与 CI 中的 Rust/NSIS 打包/Release 流程，仅保留 npm/npx 分发形态；`version:bump` 不再同步 Cargo.toml / tauri.conf.json，发版方式改为本地 `npm publish`

**对比 v1.1.4**：https://github.com/lzm04521/ssh-mcp-server/compare/v1.1.4...v1.1.5

## v1.1.4

### 功能

- **管理台新增「开机自启动」开关（设置页 · 服务区）**：一键将常驻服务注册为 Windows 登录自启（写入 HKCU Run 注册表键，无需管理员权限），切换即时生效；开关下方展示实际写入的启动命令，npx 缓存形态（路径不稳定）下给出改用全局安装的提示；非 Windows 平台自动禁用。v1.1.0 移除系统页后自启能力首次回归管理台
- **README 补充全局安装 + 常驻服务形态**：`npm install -g` 后 MCP 客户端直接以 `ssh-mcp-server` 作为 command（无参数自动拉起/复用常驻服务），配合开机自启实现管理台与 MCP 通道开机即用

### 修复

- **在线更新在 npm 全局安装下失效**：`isNpmInstalled` 仍按 v1.1.0 之前的旧包名 `@sieop` 判断安装形态，包名迁移至 `@keysqiu` 后全局安装被误判为本地开发模式，「检查更新/在线更新」不可用；现改按新包名判断
- **测试不再污染用户注册表**：Windows 上 `PUT /admin/api/autostart` 测试此前会真实写入指向测试构建路径的 HKCU Run 键，现改为 Windows 跳过该用例（与本文件测试约定一致）
- **`npm test` 在 Windows 上无法运行**：`run-tests.js` 以 `URL.pathname` 作为子进程 cwd，Windows 下为 `/D:/...` 形式导致 `spawnSync cmd.exe ENOENT`、测试入口直接失败；改用 `fileURLToPath` 规范化（与 `bump-version.mjs` 既有模式一致）

**对比 v1.1.3**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.1.3...v1.1.4

## v1.1.3

### 功能

- **审计日志与备份列表交互增强**：审计日志页面与备份管理页面表格全面支持分页大小切换（10/20/50/100 等）；审计日志页面新增右上角手动刷新按钮
- **审计日志搜索体验优化**：搜索输入框支持一键清空及回车/按钮即时触发刷新；修复极端场景下异步请求竞态及日期异常处理

### 修复

- **配置默认策略兜底**：`ConfigStore` 读取与 `settings` 接口补齐对审计策略、备份策略与安全策略默认值的平滑回退，防止旧版配置或缺失字段时产生空引用

**对比 v1.1.2**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.1.2...v1.1.3

## v1.1.2

### 修复

- **npx 升级 EBUSY 根治**：常驻服务进程的 CWD 不再落在 npx 缓存包目录内（改用用户主目录），Windows 下目录锁不再阻止 npm 升级重装时 rename 包目录，彻底消除 `EBUSY: resource busy or locked, rename ...build` 导致的 MCP 连接失败
- **升级自动生效**：代理启动时对比常驻服务与本包版本，常驻服务版本落后时自动终止并拉起新版（按监听端口定位 PID，非数字版本/回滚场景一律复用不误杀）；此前升级后旧版本常驻服务会一直驻留

**对比 v1.1.1**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.1.1...v1.1.2

## v1.1.1

### 修复

- **连接管理页移除「复用 ~/.ssh/config」提示横幅**：主机地址占位文案同步精简；Host 别名解析能力后端保留不受影响
- **暗黑模式滚动条白底优化**：滚动条样式由仅 `html` 扩展为全局所有滚动容器，轨道透明、滑块按主题着色（暗黑为半透明白），并通过 `color-scheme`/`data-theme` 与主题切换即时联动

**对比 v1.1.0**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.1.0...v1.1.1

## v1.1.0

本版本起全面转向 npx 分发形态：`npx -y @keysqiu/ssh-mcp-server@latest` 一行配置即可使用，首次调用自动拉起常驻服务，Web 管理台与 MCP 通道同进程共享配置、改动即时生效；包名由 `@sieop/ssh-mcp-server` 迁移至 `@keysqiu/ssh-mcp-server` 并首次发布 npm。桌面应用停止新功能迭代，存量用户可继续使用。

### 功能

- **npx 代理模式（新默认）**：无参数运行时自动探测/分离拉起 admin 常驻服务（端口优先级 `--admin-port > 配置文件 > 61823`，就绪等待 15s），本进程仅做 stdio→HTTP 转发（兼容 JSON 与 SSE 响应）；MCP 客户端退出后常驻服务继续驻留，下次会话秒级复用；常驻服务日志落 config 同目录 `daemon.log`
- **配置热生效**：管理台增删改主机经已有 watcher 同步至常驻服务的连接管理器，MCP 工具调用即时可用新配置，无需重启会话
- **兼容开关**：`--stdio` 强制传统 stdio 模式；配置中出现任何 SSH 参数（`--host`/`--config-file`/`--ssh` 等）时自动回退传统模式；`--admin` 手动常驻模式不变
- **审计持久化（npm 形态）**：`better-sqlite3` 纳入运行时依赖，npx/CLI 形态审计记录落 `~/.config/ssh-mcp-server/audit.db`，重启不再丢失（与桌面版对齐）

### 修复

- **移除 Web 管理台「系统」菜单**：系统页（自启动/应用更新/应用控制/一键注册）随 npx 形态下语义失效一并移除，界面仅保留连接管理/安全策略/审计日志/备份恢复/设置；对应后端接口暂保留未删

**对比 v1.0.5**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.5...v1.1.0

## v1.0.5

修复 PublishTools 同步导入后主机名称显示为空、编辑保存变成新增两个问题（同根因：桌面版导入未回填主机对象 name 字段）；启动时自动迁移治愈存量脏数据。

### 修复

- **导入回填主机名称（桌面版）**：`config_import` projects 分支导入时把 hosts map 的 key 回填到主机对象 `name` 字段（对齐 Node 版行为）；此前源数据对象内无 name 时静默存为空串，导致列表名称列空白、编辑不改名保存报「主机已存在」、改名保存变成新增且残留旧记录
- **存量数据迁移（桌面版）**：启动时自动检测并回填 name 为空的主机（写前生成 .bak 备份，数据干净时不写盘）；读取路径同步归一化兜底
- **导入解析容错（桌面版）**：项目 JSON 解析失败改为记 warning 跳过，不再静默清空整个项目；key 空白的主机跳过并告警
- **Node 版读取兜底**：`load()` 在 Zod 校验前归一化主机名，修复 Node 版读取桌面版导入的脏配置时整个 load 抛错的问题（ConnectionSchema.name 有 min(1) 约束）
- **前端展示兜底**：主机列表对象内 name 为空时用 map key 补齐，展示与编辑标识一致

**对比 v1.0.4**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.4...v1.0.5

## v1.0.4

v1.0.3 标签推送后发布流水线未产出安装包（未生成 Release），本版本重新发布同一批修复，审计日志持久化正式交付；另附升级后审计丢失问题的根因诊断文档。

### 功能

- **审计日志持久化（桌面版）**：审计记录写入 `%ProgramData%\SshMcpServer\audit.db`（与 config.json 同目录，NSIS 升级保留），表结构与查询语义对齐 Node 版，新增 `ts` 索引；此前为内存 RingBuffer（上限 5000 条），任何进程重启（升级/托盘重启服务/崩溃/关机）都会清空全部审计记录
- **保留天数生效（桌面版）**：设置页「审计保留天数」现于每次写入时清理过期记录，与 Node 版行为一致

### 修复

- 

**对比 v1.0.3**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.3...v1.0.4

## v1.0.3

修复桌面版审计日志随进程重启丢失的问题：审计记录落盘 SQLite，升级/重启不再清空。

### 功能

- **审计日志持久化（桌面版）**：审计记录写入 `%ProgramData%\SshMcpServer\audit.db`（与 config.json 同目录，NSIS 升级保留），表结构与查询语义对齐 Node 版，新增 `ts` 索引；此前为内存 RingBuffer（上限 5000 条），任何进程重启（升级/托盘重启服务/崩溃/关机）都会清空全部审计记录
- **保留天数生效（桌面版）**：设置页「审计保留天数」现于每次写入时清理过期记录，与 Node 版行为一致

### 修复

- 

**对比 v1.0.2**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.2...v1.0.3

## v1.0.2

管理台体验增强：尚无主机的项目在连接管理列表中带醒目状态标识，避免"建了项目却找不到"的困惑。

### 功能

- **空项目状态标识**：连接管理项目列表中，主机数为 0 的项目描述行追加橙色「未配置主机」标签（Node 版与桌面版共用同一前端，同步生效），一眼区分"已就绪"与"待配置"的项目

### 修复

- 

**对比 v1.0.1**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.1...v1.0.2

## v1.0.1

管理与桌面端体验修复：审计日志可预览执行明细，桌面版定时备份补齐调度与清理，暗黑模式三处显示修复。

### 功能

- **审计明细与预览**：审计日志现记录命令/路径明细（命令含工作目录前缀，传输记源→目标路径），列表新增「命令 / 路径」列，支持弹窗查看单条详情，搜索可按命令内容命中（Node 与桌面版双端同步）
- **定时备份（桌面版）**：Tauri GUI 内置备份调度——启动时按保留策略清理一次历史积压，之后按设定间隔自动快照并执行清理，与 Node 版语义一致
- **设置开关更名**：「记录执行结果」更名「记录成功执行」并补充说明（关闭后仅记录失败操作），消除语义歧义

### 修复

- **暗黑模式**：修复连接管理（项目选中项）、安全策略（黑名单输入框）、系统（信息卡片）三处硬编码浅色背景导致文字不可读的问题
- **备份时间显示**：修复 Windows 下文件复制保留源 mtime 导致所有备份显示同一时间的问题，备份时间改以文件名内嵌时间戳为准
- **备份清理**：修复「最大备份数量」「保留天数」在桌面版不生效的问题（此前桌面版无清理逻辑，备份目录无限增长）

**对比 v1.0.0**：https://github.com/SIE-Operations-and-Maintenance-Team/ssh-mcp-server/compare/v1.0.0...v1.0.1

## v1.0.0

首个正式版本。SSH-based MCP Server——让 MCP 客户端（Claude Code、Cursor 等）通过标准化工具在远端执行命令与传输文件，内置 Web 管理台与 Windows 托盘应用。

### 功能

- **MCP 工具**：`execute-command` / `upload` / `download` / `list-servers`，支持多连接、白/黑名单校验、输出限制与结构化错误
- **连接能力**：密码 / 私钥 / Agent / 2FA 认证，SOCKS5 与 HTTP(S) 代理，exec / shell 双传输模式（shell 模式适配堡垒机/跳板机）
- **Admin 管理台**：项目-环境-主机三级树管理连接；安全策略、审计日志、配置备份/恢复、定时快照、MCP 客户端一键注册
- **Windows 桌面应用**：Tauri 2 纯托盘单 exe——SSH 连接池 / MCP StreamableHTTP / Admin 静态站点全部内嵌；「打开管理页」在系统默认浏览器中打开；托盘菜单含关于（版本+服务地址）/ 重启服务 / 退出，双击图标直接打开管理页
- **在线自更新**：应用内置 minisign 验签，自动拉取 GitHub Releases 的 latest.json 完成静默升级；Node 版支持 npm registry 版本检查
