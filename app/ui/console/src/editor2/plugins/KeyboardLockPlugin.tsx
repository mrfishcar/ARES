/**
 * KeyboardLockPlugin (disabled)
 *
 * Previously forced kb-open classes and viewport rewrites that fought native
 * Safari caret restoration. The Extraction Lab now relies on a static 100%
 * height shell and a single scroll owner, so this plugin is intentionally a
 * no-op to avoid reintroducing the second-focus jump.
 */
export function KeyboardLockPlugin() {
  return null;
}
