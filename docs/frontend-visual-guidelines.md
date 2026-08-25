# Mobile Web 前端视觉与动效实施规范

状态：已实现基线，持续维护。

完整设计原则见工作区 [[Mobile Web 前端视觉与动效规范]]。本仓库实现时遵循以下约束：

- Runtime 事件先进入领域状态，再进入合并后的展示状态；组件不得直接把每个 delta 变成一次布局动画。
- `LiveActivity` 保持固定高度，只在内部切换当前文案和图标。
- `ToolSteps` 默认收起；展开后使用固定高度滚动窗口。
- 空 Poll timeout 不触发 Session 快照刷新；真实 Session 事件才触发静默刷新。
- 活跃 Run 消息优先于滞后快照，终态快照才允许替换并收敛。
- 所有新增动效必须提供 Reduced Motion 行为，不能依赖颜色或运动表达唯一状态。

相关实现：

- `src/components/useActivityPresentation.ts`
- `src/components/ConversationView.tsx`
- `src/runtime/httpRuntimeClient.ts`
- `src/runtime/sessionRefresh.ts`
- `src/styles.css`

每次修改流式状态、活动栏、执行轨迹或滚动引导，都需要覆盖桌面和 390×844 移动视口，并运行 `npm test` 与 `npm run build`。
