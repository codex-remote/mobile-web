# Codex Remote Mobile Web

Codex Remote 的用户侧 Web 客户端。项目以移动端为第一视口，交互和视觉语言对齐现有 iPhone App，同时在桌面浏览器提供会话、对话与 Runtime 检查器的稳定三栏布局。

> 当前状态：真实 Run Server HTTPS、Session SSE、Run SSE、Bootstrap 和多标签页恢复已接通并完成 mobile-web 主验收。公网鉴权、限流、Cursor 过期和多实例属于后续生产硬化，不包含在当前开发版中。

## 本地运行

```bash
./start.sh test
```

开发端口固定，并在启动前自动停止正在监听对应端口的进程：

| 用途 | 命令 | 固定端口 |
| --- | --- | --- |
| 人工测试 | `./start.sh test` | `4174` |
| Codex 自动调试 | `./start.sh codex` | `4173` |

参数是必填项，避免误启或替换错误的实例。启动其中一个模式只处理它自己的固定端口，不会终止另一个模式。脚本会在需要时自动执行 `npm install`，并绑定 `0.0.0.0`、等待页面就绪、输出本机地址与当前 Mac 的局域网 IPv4 地址。

未显式配置时，页面会用当前访问主机和端口 `18775` 推导 Run Server 地址。例如从 `http://192.168.3.8:4174` 打开页面时会连接 `http://192.168.3.8:18775`。局域网 IP 改变后只需使用新的页面地址，不需要重启 Mobile Web，也不会继续读取浏览器中旧的自动地址。需要连接其他实例时可以显式覆盖：

```bash
VITE_RUNTIME_URL=http://192.168.0.108:18775 ./start.sh test
```

`npm run dev:codex` 和 `npm run dev:test` 保留为对应模式的快捷命令，但根目录 `./start.sh` 是统一入口。

### 全局启动

本机已将该服务注册到 `devrun`：

```bash
devrun codexremote mobile-web test
devrun 4174
```

两种写法都会转交给本目录的 `./start.sh test`。使用 `devrun list` 可以查看所有已注册服务和端口。

人工测试实例由 `launchctl submit` 托管，进程异常退出时会自动重新启动。正常停止或代码维护仍通过外部服务管理命令执行，避免由服务自身同步替换正在承载的进程。

生产构建和测试：

```bash
npm test
npm run build
```

## 当前能力

- 移动端项目抽屉、真实会话列表、历史对话流与本地 Composer。
- 桌面端自适应工作区和 Runtime 检查器。
- Run Server 的 Project/Session/Run 创建、查询、取消和 Bootstrap 初始化。
- Session SSE 自动发现同一会话的新 Run，Run SSE 按持久 Cursor 恢复流式结果。
- Run Server URL、临时 Token、健康检查和事件日志。
- 支持跨 chunk、多行数据和心跳的 SSE 解码器及单元测试。

## 通信边界

浏览器只通过 Run Server 的公开 HTTPS/SSE 契约通信，不直接连接 Redis、PostgreSQL、Mac Agent WSS 或 Admin API。目标链路为：

1. HTTPS 创建或查询 Session/Run。
2. Session SSE 发现其他客户端创建的新 Run 和状态变化。
3. Run SSE 接收单个 Run 的内容、工具和终态事件。
4. 首次加载或游标失效时以 HTTP 快照恢复，再续接 SSE。

当前机器契约维护在 `relay-server/apifox/openapi.json`，并同步到 Apifox 项目 `8693796`。

## 目录

```text
src/
├── components/        # 产品界面和连接检查器
├── runtime/           # HTTP/SSE 客户端与协议解码
├── App.tsx            # 会话与运行状态编排
├── styles.css         # 响应式视觉系统
└── types.ts           # Runtime v1 客户端模型
```

## 安全说明

检查器中的访问令牌只保存在当前页面内存，不写入 `localStorage`。当前开发版没有服务端鉴权，不能直接暴露到公网；正式鉴权、CORS、CSRF 和 Token 更新在阶段 7 实现。
