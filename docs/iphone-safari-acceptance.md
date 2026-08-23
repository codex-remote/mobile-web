# iPhone Safari 真机验收

## 里程碑结论

2026-08-23 在 iPhone 14 Pro、Safari、局域网 HTTP Gateway `18774` 上完成真机验收。当前版本达到“局域网单标签实际可用”里程碑：用户可以运行 `devrun crweb`，扫描终端生成的 10 分钟一次性二维码，进入 Mobile Web 并完成真实会话操作。

该结论不包含公网发布，也不宣称局域网多标签认证已经稳定。双标签 Refresh Token 轮换竞态是已确认限制，必须在后续里程碑修复。

## 实际执行结果

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 系统相机扫描一次性二维码 | 通过 | Safari 打开 `/pair`，一次兑换后进入真实工作区 |
| Gateway 与 Runtime 数据加载 | 通过 | 项目、会话、历史轮次和 Mac 在线状态可见 |
| 页面刷新恢复 | 通过 | 刷新后 HttpOnly Refresh Cookie 自动恢复认证和原会话 |
| 移动导航与滚动 | 通过 | 项目抽屉、静止点击、会话切换、加载骨架和纵向滚动正常 |
| 新建会话与提交 | 通过 | 真机创建专用会话并提交 `Reply ok only` |
| SSE 流式与完成态 | 通过 | 真机实时显示 `ok`，随后收敛为完成态 |
| Composer 键盘行为 | 通过（有限） | 聚焦位置稳定、草稿保留、发送和可见收起按钮通过；中文 marked-text 未自动验证 |
| 用户退出 | 通过 | 页面显示“此设备已退出”，数据库撤销原因为 `client_logout` |
| Mac 控制面撤销 | 通过 | `relayctl revoke-client` 后无需刷新即回到配对页，数据库原因为 `control_revoke` |
| Gateway 敏感路径隔离 | 通过 | `/status` 与 `/v1/auth-control/*` 经 Gateway 返回 404，Run Server/Auth Control 只监听 Loopback |
| 双标签并发刷新 | 失败 | 一个标签轮换后，另一个标签在 186ms 后重放旧 Refresh Token，Session 被 `refresh_replay` 撤销 |
| Access Token 过期后的 Cursor 恢复 | 未独立通过 | 双标签轮换竞态先撤销了 Session，无法把该次结果作为 Cursor 恢复证据 |

## 双标签已知限制

### 症状与范围

同一 iPhone Safari 中打开两个 Mobile Web 标签。在 Access Token 到期且两个标签同时恢复 HTTP/SSE 时，两个标签可能先后使用同一个 Refresh Cookie。第一个请求成功轮换 Token，第二个请求被服务端识别为 Refresh Token replay，随后整个 Session 被撤销，两个标签都回到配对页。

单标签扫码、刷新和持续使用已经通过验收。该限制只影响共享同一 Refresh Session 的并发刷新，但一旦触发会要求重新配对，因此不能把多标签标记为可用。

### 已确认原因

- `AuthSession.withRefreshLock` 只在 `navigator.locks` 可用时序列化刷新。
- 局域网入口当前是普通 HTTP Origin，不应假设浏览器提供只面向 Secure Context 的 Web Locks。
- 缺少锁时，前端直接执行刷新请求。
- Run Server 正确执行 Refresh Token rotation 和 replay 防护；旧 Token 第二次出现时以 `refresh_replay` 撤销 Session。

### 快速诊断

1. 手机出现“此设备的访问凭证已失效”后，查询最新 `auth.refresh_sessions`。
2. 若 `rotated_at` 后极短时间出现 `revoked_at`，且 `revoke_reason=refresh_replay`，检查是否有多个 Safari 标签同时打开。
3. 不要关闭服务端 replay 防护来掩盖客户端竞态。

### 恢复与预防

- 当前恢复方式：关闭多余标签，重新运行 `devrun crpair` 并扫描新的一次性二维码。
- 当前使用约束：局域网里程碑按单标签使用。
- 后续修复必须覆盖没有 `navigator.locks` 的真实 Safari/HTTP Origin，并保留服务端 replay 防护。
- 自动回归需要使用两个独立页面上下文共享 Cookie，在相同 Access Token 过期边界并发触发 Runtime/SSE 恢复。

## 复验要求

修复认证协调后，至少重复以下流程：

1. 扫码进入第一个标签并刷新一次。
2. 打开第二个同源标签，确认两个标签均恢复同一 Session。
3. 在 Access Token 过期边界让两个标签同时读取 Session SSE 和 Run SSE。
4. 确认只发生一次有效刷新轮换，不出现 `refresh_replay`。
5. 在一个标签创建 Run，另一个标签通过 Session SSE 发现并按 Cursor 恢复。
6. 分别复验用户退出与 `relayctl revoke-client`，两个标签都应立即回到配对状态。

中文或其他 marked-text 输入法、VoiceOver 和 Reduce Motion 需要由人工直接操作真机，不得用 iPhone 镜像自动按键替代结论。
