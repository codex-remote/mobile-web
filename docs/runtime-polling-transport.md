# Runtime JSON 轮询传输适配

状态：本地已实现，真机/边缘验收待完成。

本文规定 `mobile-web` 如何消费 Runtime JSON 轮询。UI 不直接知道 `/events:poll` 路径，也不因为传输方式变化而复制消息处理逻辑。当前 SSE 适配继续保留。

## 1. 适配边界

`RuntimeClient` 是唯一的 Runtime 传输入口。建议向面向事件的接口演进：

```ts
watchSession(sessionId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
watchRun(runId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
```

实现由两个 Transport Adapter 组成：

- `SseTransport`：保留当前 `text/event-stream` 解码、heartbeat、`Last-Event-ID` 和断线恢复；
- `JsonPollTransport`：调用 `events:poll`，把 JSON 批次转换为相同的 `RuntimeEvent`。

`App.tsx`、Conversation 状态机、工具步骤和终态处理只消费 `RuntimeEvent`，不得拼接传输专用 URL。

## 2. JSON Poll 循环

伪代码：

```text
cursor = initial durable cursor
while not aborted:
    response = GET events:poll(after=cursor, wait_ms=15000, limit=100)
    for event in response.events:
        if event.id <= cursor:
            continue
        applyRuntimeEvent(event)
        cursor = event.id
    if response.terminal:
        stop
    if response.timed_out:
        continue without publishing a UI state change
```

客户端必须在应用事件后推进内存游标。请求响应丢失时，下一次请求可以重复得到同一批事件；按资源和 sequence 去重即可。客户端不把本地 cursor 当作服务端事实，刷新或重建时从 Session/Run 快照恢复。

空超时由 `JsonPollTransport` 内部直接续接，不返回到页面编排层，也不触发完整 Session 快照或可见的 `refreshing` 状态。只有真实 Session 事件才启动静默后台快照；活跃 Run 的内存流式消息在快照仍处于 active 状态时优先保留，终态快照仍正常替换并收敛。

## 3. 超时、取消与退避

- 轮询请求的客户端 timeout 必须大于服务端 `wait_ms`，建议 20-25 秒；普通 8 秒请求超时不能直接复用。
- Session 切换、组件卸载、页面退出和用户取消只调用 `AbortController`，不调用 Run cancel API。
- HTTP 200 空超时不是错误；直接以旧/新 cursor 发起下一次请求，并加入 100-500 ms jitter。
- 401 走现有 Refresh 流程后重试一次；同一请求不能无限 Refresh。
- 429、5xx、网络断开使用有限指数退避，并记录可读的连接状态。
- 取消、终态和手动切换必须清理该资源唯一的轮询控制器，不能留下后台循环。

## 4. 模式选择

传输模式由构建入口决定：

```text
poll | sse
```

模式选择不得依赖业务组件猜测边缘厂商；完整 SSE/Poll 栈使用不同 Gateway/Relay/Auth Control 端口，启动后不通过 URL 路由切换。

## 5. UI 与可观测性

UI 文案使用“实时连接”或“连接状态”，不把 SSE 当作产品能力名称。连接检查器可以显示当前 transport、cursor、最近一次 batch size、等待耗时和重连次数，但不得显示 Access Token、Prompt 或完整事件正文。

## 6. 必测场景

- 新 Run 创建后 Session 轮询发现 `run.created`；
- Run 事件跨多个 JSON batch，顺序和内容不变；
- 空超时、HTTP 响应丢失、重复 batch 和 cursor 恢复；
- `assistant.delta`、工具事件和 terminal event 的 UI 行为与 SSE 一致；
- 401 Refresh、429/5xx 退避、AbortController 取消；
- 长回答、多个活动 Run、移动 Safari 后台恢复和页面切换；
- SSE 模式仍通过现有测试，且模式切换不改变业务状态机。
