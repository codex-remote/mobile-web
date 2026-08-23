# Mobile Keyboard Maintenance

## Invariant

Composer 草稿保留在组件本地状态。移动端键盘打开或关闭时，输入框、工具栏和发送按钮必须保持固定尺寸。App 根布局不跟随 `visualViewport` 改写高度或顶部位置；只允许 Composer 根据键盘实际覆盖的底部区域移动。

不要用 `transform` 伪装 Composer 的布局位置，也不要为键盘位移增加 CSS transition。发送和停止按钮必须在 pointer-down 阶段保留 textarea 焦点，避免 click 前布局变化。

## 2026-08-23 Safari Keyboard Position Jump

### 症状与范围

- iPhone 点击 Composer 后，输入区先跳到页面顶部，部分内容短暂超出视口，随后再向下移动到键盘上方。
- 问题只影响需要 `visualViewport` fallback 的移动浏览器；会调整 layout viewport 的浏览器继续使用 `interactive-widget=resizes-content` 和动态视口单位。

### 已确认原因

Safari 在键盘打开时先报告缩小后的 `visualViewport.height`，随后才完成保持焦点可见所需的 `offsetTop` 平移。把这两个值写入整个 App 的 `height` 和 `top` 会让 App 根布局与浏览器自动聚焦滚动同时重排，输入区因而先冲向顶部再回落。等待所谓稳定 frame 仍会暴露浏览器聚焦滚动，不能消除根布局重排。

第一版 Composer-only 修复仍使用 `transform`。这只改变绘制位置，不改变 Safari 焦点可见性算法读取的 textarea 布局位置；浏览器因此继续滚动原始布局位置，与 JS inset 形成反馈环。

### 快速诊断

1. 确认 `.app-shell` 没有读取任何键盘相关的高度或顶部 CSS 变量。
2. 检查 `Composer.tsx` 是否只写入 `--composer-keyboard-inset`。
3. 确认 inset 使用 `layoutHeight - visualViewport.height - visualViewport.offsetTop`，并被限制在布局视口内。
4. 确认移动端 Composer 使用真实 `bottom` 定位，而不是 `transform`。
5. 确认 `--composer-zone-height` 为对话网格保留输入区空间，且 blur 后仍继续跟踪，直到 visual viewport 恢复并清除 override。

### 恢复与预防

- 保持 App 根布局稳定，只移动 Composer，不让工具栏和会话区参与键盘重排。
- 使用键盘底部覆盖量抵消 Safari 的 `offsetTop` 聚焦平移；`height` 与 `offsetTop` 分先后更新时，Composer 的可视底边仍保持一致。
- 使用绝对定位的真实 `bottom` 改变 textarea 布局位置，让 Safari 的焦点可见性判断与屏幕位置一致；通过 `ResizeObserver` 保留等高网格行。
- 打开和关闭键盘使用同一条逐帧同步路径，不添加延时窗口或 CSS 位移动画。
- 保持 Composer 聚焦前后所占高度、底部间距和垂直位置不变。
- 修改后至少覆盖草稿保留、发送、收起按钮、连续开合键盘和带长对话滚动的真机验证。

### 验证证据

- `src/runtime/keyboardViewport.test.ts` 覆盖标准 resize、Safari 分阶段 pan、边界、缩放和完整收起跟踪。
- 2026-08-23：124 个 Vitest 用例、TypeScript 检查和生产构建通过。
- 2026-08-23：稳定窗口方案及 transform 版 Composer-only 方案经真实 iPhone 验证仍有冲顶问题，已替换为真实 bottom 布局定位。
- 2026-08-23：在 iPhone 14 Pro Safari 通过扫码进入真实局域网 Gateway 后，实际验证 Composer 聚焦、稳定位置、草稿保留、发送、流式完成和可见键盘收起按钮；未观察到输入区冲顶或布局跳动。
- 中文 marked-text 仍需由人工直接操作真机输入法复验；iPhone 镜像的自动按键桥接会丢失或改写中英文字符，不能作为 Web Composer 输入正确性的证据。
