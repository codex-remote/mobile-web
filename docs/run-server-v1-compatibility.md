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
