/**
 * Host half of the dsh-ding bundle.
 *
 * The feature is entirely Client-side: the Web client already receives running
 * state for every session, and Electron renderers can raise native notifications
 * under the DeepSeek Harness app identity. The Host row exists so the bundle can
 * be installed, enabled, and displayed in Plugins.
 */
export function apply() {}
