export function shouldTrackKeyboardViewport(composerFocused: boolean, keyboardViewportApplied: boolean): boolean {
  return composerFocused || keyboardViewportApplied;
}

export function resolveKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
  scale: number,
): number | null {
  if (![layoutHeight, visualHeight, visualOffsetTop, scale].every(Number.isFinite)) return null;
  if (layoutHeight <= 0 || visualHeight <= 0 || Math.abs(scale - 1) > 0.01) return null;
  if (visualHeight >= layoutHeight - 2) return null;

  const visualBottom = Math.min(layoutHeight, Math.max(visualHeight, visualOffsetTop + visualHeight));
  return Math.round(Math.max(0, layoutHeight - visualBottom));
}
