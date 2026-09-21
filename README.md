# Codex Remote Mobile Web

Codex Remote 的用户侧 Web 客户端。项目以移动端为第一视口，交互和视觉语言对齐现有 iPhone App，同时在桌面浏览器提供会话、对话与 Runtime 检查器的稳定三栏布局。

> 当前状态：局域网单标签可用里程碑已于 2026-08-23 通过 iPhone 14 Pro 真机验收。Gateway、Runtime Auth、真实 Run Server HTTP/SSE、JSON 增量轮询入口、Bootstrap、扫码配对、刷新恢复、对话提交、退出和 Mac 端撤销已接通。轮询真机压力、公网 TLS、限流、Cursor 过期和多实例属于后续工作。

## 本地运行

```bash
./start.sh test
```

开发端口固定，并在启动前自动停止正在监听对应端口的进程：

| 用途 | 命令 | 固定端口 |
| --- | --- | --- |
| 人工测试 | `./start.sh test` | `4174` |
| 轮询入口人工测试 | `npm run dev:poll` | `4175` |
| Codex 自动调试 | `./start.sh codex` | `4173`，Loopback 自动鉴权 |
| 发布兼容 Gateway | `./start.sh gateway` | `18774` |
| 本地调试统一入口 | `./start.sh gateway-debug` | `18874` |

参数是必填项，避免误启或替换错误的实例。启动其中一个模式只处理它自己的固定端口，不会终止另一个模式。脚本会在需要时自动执行 `npm install`，并绑定 `0.0.0.0`、等待页面就绪、输出本机地址与当前 Mac 的局域网 IPv4 地址。非交互环境未加载 Homebrew Shell 配置时，`start.sh` 和 `service.sh` 会自动检查 Apple Silicon 的 `/opt/homebrew/bin` 与 Intel Mac 的 `/usr/local/bin`。

本地快速调试入口为 `http://<mac-lan-ip>:18874`，配套 Run Server 为 `127.0.0.1:18875`、Auth Control 为 `127.0.0.1:18876`。这组端口专供源码工作区的 `devrun crweb`，不会占用 Homebrew `codex-remote` beta/发布版的 `18774/18775/18776`。发布兼容 Gateway 仍由 `./start.sh gateway` 使用 `18774`。页面只使用当前 Origin 的 `/v1/auth/*` 与 `/v1/runtime/*`，浏览器不再推导或直连 Run Server。`4173/4174` 只用于明确的 Vite 调试，其 `/v1` 由 Vite 开发代理转发到本地 `18875`。

`codex` 模式在 `http://127.0.0.1:4173` 或 `http://localhost:4173` 缺少 Refresh Session 时，会通过 Vite 的 Loopback-only 端点自动创建一次性 Pairing Grant，再走标准 Exchange 流程。该端点只在 `./start.sh codex` 中启用，同时校验 Loopback Socket、Host、Origin 和自定义请求头；从局域网 IP 访问 `4173`、人工测试 `4174`、生产构建和 Gateway `18874` 均不会自动签发凭证。

`npm run dev:codex` 和 `npm run dev:test` 保留为对应模式的快捷命令，但根目录 `./start.sh` 是统一入口。

`npm run dev:poll` 使用固定 `4175` 的独立入口选择 JSON 增量轮询；普通 `dev:test` 固定使用 `4174` 并继续使用 SSE。完整 `devrun crweb` 默认构建 SSE 模式，`devrun crweb poll` 构建 Poll 模式并使用独立端口。两种完整栈互斥，不再通过 `/poll` 路由切换传输。

### 全局启动

本机已将该服务注册到 `devrun`：

```bash
devrun codexremote mobile-web test
devrun 4174
devrun codexremote mobile-web poll
devrun 4175
devrun codexremote mobile-web-gateway gateway
devrun 18774
devrun codexremote mobileweb-stack quick
devrun 18875
devrun codexremote mobileweb-stack poll
devrun 18885
```

前两种写法转交给 `./start.sh test`，`devrun 18774` 仍指向发布/兼容 Gateway；`devrun crweb`（或 `devrun 18875`）启动由开发版 Runtime Supervisor 托管的 SSE 完整栈，`devrun crweb poll`（或 `devrun 18885`）启动互斥的 Poll 完整栈。SSE 端口为 `18874/18875/18876`，Poll 端口为 `18884/18885/18886`，外层分别使用 `.sse` 和 `.poll` launchd 服务。开发 Supervisor 默认把当前用户主目录 `~` 作为 Mac Agent workspace root；可用 `CODEXREMOTE_WORKSPACE_ROOT` 显式覆盖。Vite 的 `test/codex/poll` 入口仍用于快速前端开发，不属于完整 Supervisor 栈。使用 `devrun list` 可以查看所有已注册服务和端口。

Gateway 采用“部署时构建、运行时只启动产物”的边界。`./deploy.sh` 负责生成 `dist/index.html`、`bin/mobile-web-gateway` 和 `bin/codex-remote-dev-supervisor`；`devrun crweb` 通过 Supervisor 运行这些产物，使用 `18874` -> `18875` 的本地链路；`start.sh gateway` 和 `devrun 18774` 保留 `18774` 发布兼容端口。缺少产物时会在停止现有监听器之前失败并给出恢复命令。

人工测试实例由 `launchctl submit` 托管；完整 `crweb` 栈由一个开发版 Runtime Supervisor 管理，任一核心子进程异常退出会终止并由 `launchd` 重启整个栈。正常停止或代码维护仍通过外部服务管理命令执行，避免由服务自身同步替换正在承载的进程。

日常维护使用项目内的轻量服务控制入口：

```bash
./service.sh restart
./service.sh restart codex
./service.sh status
./service.sh stop
```

省略模式时，`service.sh` 只管理人工测试实例；可显式传入 `codex` 或 `gateway`。`test/codex` 会检查固定端口、HTTP、Relay `/status` 和 `agent_connected`；Gateway 作为独立进程只以监听器和 `/gateway/healthz` 判定自身健康，上游状态由完整栈部署检查负责。

### 快速重新部署

需要把当前三个独立仓库的工作区版本一起部署到 Mobile Web 本地栈时运行：

```bash
./deploy.sh
```

默认流程先通过 Relay 仓库的 Compose 配置启动并等待开发 PostgreSQL/Redis 健康，再同步必要依赖、构建前端/Gateway/Relay/Mac Agent/开发 Supervisor，并按当前模式的 Relay、Agent、Gateway 端口精确重启和检查。显式设置 `RUNTIME_DATABASE_URL` 或 `RUNTIME_REDIS_URL` 时会跳过对应默认容器。成功时终端结果框列出当前 `SSE` 或 `POLL` 模式的唯一入口、整体状态和配对有效期；每次启动只生成一张对应模式的一次性二维码。SSE 使用 `18874/18875/18876`，Poll 使用 `18884/18885/18886`，两套完整栈互斥。Vite、Go、Docker Compose 与 launchd 的阶段诊断日志保存在 `.run/mobileweb/*.log`，失败时才回放对应日志末尾 24 行。非交互式执行会跳过授权生成，避免凭证进入 CI 或重定向日志。发布前需要完整验证时使用：

```bash
./deploy.sh --check
```

该脚本仅做本机部署编排，不导入兄弟仓库源码。它必须从 Terminal 或 Codex Desktop 运行；如果检测到当前命令由将被停止的 `mobileweb-debug` Mac Agent Turn 承载，会拒绝同步自重启。全局快捷入口为 `devrun codexremote mobileweb-stack quick`、`devrun 18875` 或 `devrun crweb`，注册项会显式传入 `--quick`。

Gateway 启动与 launchd 排障见 [Gateway Maintenance](docs/gateway-maintenance.md)。

前端视觉、流式活动栏、执行轨迹、动效和移动端审美规范见 [Frontend Visual Guidelines](docs/frontend-visual-guidelines.md)；工作区总规范见 `Codex Remote/03-模块设计/Mobile Web 前端视觉与动效规范.md`。

移动端 Composer 键盘位置、Safari `visualViewport` fallback 与真机复验要求见 [Mobile Keyboard Maintenance](docs/mobile-keyboard-maintenance.md)。

iPhone Safari 真机验收结果、已知限制与复验步骤见 [iPhone Safari Acceptance](docs/iphone-safari-acceptance.md)。

生产构建和测试：

```bash
npm test
npm run build
```

## 当前能力

- 移动端项目抽屉、真实会话列表、历史对话流与本地 Composer。
- 桌面端自适应工作区和 Runtime 检查器。
- Run Server 的 Project/Session/Run 创建、查询、取消和 Bootstrap 初始化。
- 支持主动刷新 Mac 历史会话、显示已处理/总会话进度，并在完整快照对账后隐藏 Mac 端已删除的会话。
- Session SSE 自动发现同一会话的新 Run，Run SSE 按持久 Cursor 恢复流式结果。
- 会话详情使用显式加载状态和两级 stale-while-revalidate 缓存：内存层去重请求并复用终态 Run，IndexedDB 保存最多 20 个完整终态快照；目录 sequence 变更时保留旧内容并在后台刷新。
- 打开已有会话并载入历史轮次后，视口先定位最后一个用户提问：短回答快速落底，中等回答按“加速－匀速－减速”导览，超过 2.5 个视口的长回答停在提问处并提供“跳到最新”按钮；任何滚动意图都会立即把控制权交还用户，减少动态效果偏好下则直接定位末尾。
- 同源 Gateway、一次性设备配对、内存 Access Token、HttpOnly Refresh Cookie、自动轮换和健康/事件检查。
- Codex 本机调试模式在 Loopback 上自动完成标准一次性配对，不需要手工打开配对链接。
- 回答中的本地源码引用会打开同一前端 host 的代码查看器，读取当前 Mac 工作树并聚焦指定行；普通 Web 链接仍作为外链打开。
- 支持跨 chunk、多行数据和心跳的 SSE 解码器及单元测试。
- JSON 增量轮询传输已进入 `RuntimeClient`、Gateway allowlist 和本地测试；真机压力与公网边缘验收仍待完成，规则见 `docs/runtime-polling-transport.md`。

## 术语规范

产品文案、设计讨论、代码和 Runtime API 统一使用 [会话与对话术语规范](docs/terminology.md)。其中 `Session` 表示持续存在的会话，`Run` 表示一次对话轮次，“对话”仅表示一个会话中全部轮次组成的 UI 内容。

## 通信边界

浏览器只通过 Gateway 的同源 HTTP、SSE 或 JSON 轮询契约通信；轮询入口已实现，未来公网在边缘升级为 HTTPS。浏览器不直接连接本地 Run Server `18875`、Redis、PostgreSQL、Mac Agent WSS 或 Admin API。当前已实现链路为：

1. 通过同源 HTTP 创建或查询 Session/Run；未来公网 Origin 使用 HTTPS，路径不变。
2. Session SSE 发现其他客户端创建的新 Run 和状态变化。
3. Run SSE 接收单个 Run 的内容、工具和终态事件。
4. 首次加载或游标失效时以 HTTP 快照恢复，再续接 SSE。
5. 源码查看通过受控的 Runtime POST 接口短暂转发到 Mac Agent，不直接访问 Mac Agent WSS，也不持久化代码。

非 SSE 传输不复用完整 Run 快照，而是使用持久 sequence 的增量 JSON 长轮询。实现前必须同步更新 Run Server OpenAPI、Gateway allowlist、Fixtures 和 `RuntimeClient` Adapter；具体边界见 `docs/runtime-polling-transport.md`。

会话目录只提供标题、状态和 sequence，不代表详情已经加载。页面必须在详情状态为 `ready` 后才能把零 Run 解释为新会话；冷加载、后台刷新、无缓存失败和缓存刷新失败分别显示独立状态。会话内容只写入按 Run Server URL 隔离的 IndexedDB，不进入 `localStorage`，访问令牌也不属于缓存载荷。

当前上游机器契约维护在 `relay-server/apifox/openapi.json`；Gateway 本地暴露策略是 `gateway/contract_v1.go`，兼容记录见 [Run Server v1 Gateway Compatibility](docs/run-server-v1-compatibility.md)。本地 OpenAPI 已包含 Auth，远端 Apifox 同步待单独执行。

## 目录

```text
src/
├── auth/              # 配对、内存 Access Token 与 Refresh 单飞
├── components/        # 产品界面和连接检查器
├── runtime/           # HTTP/SSE 客户端与协议解码
├── App.tsx            # 会话与运行状态编排
├── styles.css         # 响应式视觉系统
└── types.ts           # Runtime v1 客户端模型
gateway/               # 独立 Go Gateway 模块、contract_v1 路由策略与代理测试
```

## 安全说明

Access Token 只保存在页面内存，Refresh Token 只存在于 `HttpOnly; SameSite=Strict` Cookie；配对码从 Fragment 读取后立即清理。所有 Runtime 路由统一要求 Bearer Token 和 Scope，源码读取要求 `source:read`。公网发布仍必须补齐稳定域名、TLS、`Secure` Cookie、限流和恢复演练。

Codex 调试自动鉴权不是 Runtime 后门：浏览器仍获得普通、可撤销、会轮换的 Token；Vite 只代替人工调用 Loopback Auth Control 创建一次性 Grant。自动入口不进入 Gateway allowlist，也不会出现在生产构建中。
