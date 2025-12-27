/**
 * ScrollIntoViewPlugin (DISABLED - Dec 2025)
 *
 * Philosophy: Let Safari handle native scrollIntoView
 *
 * After fixing the layer coverage issue (html/body/root all have proper
 * backgrounds with !important), Safari's native caret tracking works
 * perfectly. No custom JavaScript needed - embrace browser behavior!
 *
 * Previous approach had custom visualViewport tracking, but it was
 * fighting Safari's native behavior. Now that backgrounds are fixed,
 * we can rely on the browser's built-in scrollIntoView.
 */
export function ScrollIntoViewPlugin() {
  // NO-OP: Let Safari's native scrollIntoView handle caret tracking
  // The background layer fix (html/body with !important) was the real solution
  return null;
}
