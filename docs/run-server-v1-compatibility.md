# Run Server v1 Gateway 兼容记录

状态：已实现，并于 2026-08-22 完成自动验证。

本文只记录可独立构建的 Mobile Web Gateway 与 Run Server 之间允许存在的耦合。

| 关注点 | 事实源 |
| --- | --- |
| 上游 HTTP Schema | `relay-server/apifox/openapi.json` |
| Gateway 暴露策略 | `gateway/contract_v1.go` |
| Gateway 契约标识 | `run-server-v1`，由 `GET /gateway/healthz` 返回 |
| 浏览器 Adapter | `src/runtime/` 与 `src/auth/` |

Gateway 可以依赖 HTTP Method、版本化 Path、Header、Cookie、Envelope 和 SSE 语义。它不得导入兄弟仓库源码、读取 Runtime/Auth 数据库、连接 Agent WSS，也不得根据边缘身份 Header 推断用户已授权。Run Server 始终是最终认证和授权边界。

上游路由出现在 OpenAPI 中，不等于已被 Gateway 公开。新增或修改暴露路由时，必须同时审查 `contract_v1.go`、Gateway 测试、浏览器 Adapter 测试和 Run Server 契约。破坏性变化必须建立新契约版本，不能静默改变 `run-server-v1`。

`deploy.sh` 可以在本地工作区编排兄弟仓库的可执行文件，但这种部署期知识不是 Gateway 二进制的运行时依赖。

## 非 SSE 轮询接口（本地已实现）

`/v1/runtime/sessions/{session_id}/events:poll` 与 `/v1/runtime/runs/{run_id}/events:poll` 已进入 `run-server-v1` 的公开 allowlist、OpenAPI 和 Gateway 实现，并通过本地契约测试。现有 Session/Run SSE 路径继续保留；公网限流、Cursor 过期和边缘行为仍需单独验收。

## iPhone Runtime v1 扩展（本地已实现）

Gateway 明确放行三个 `/v1/auth/native/*` POST 路径和
`GET /v1/runtime/projects/{project_id}/execution-profiles`。Native Auth 与浏览器 Auth 使用同一
服务端 Session、Scope、Rotation 和重放撤销语义，但 Refresh Token 只在原生响应体中返回，
由 iPhone Keychain 保存；浏览器现有 HttpOnly Cookie 合同不变。执行档位读取要求
`runtime:read`，创建 Run 时的可选 `permission_profile_id` 要求 `runtime:write`。
