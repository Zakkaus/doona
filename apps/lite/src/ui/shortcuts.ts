export const shortcuts = {n: 'nodes', s: 'subscriptions', g: 'groups', r: 'routing', d: 'dns'} as const;
export function isTyping(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"]');
}
export function browserLocale(languages: readonly string[]): 'en' | 'zh-CN' | 'zh-TW' {
  const language = languages[0]?.toLowerCase() ?? '';
  return /^zh-(?:tw|hk|hant)(?:-|$)/.test(language) ? 'zh-TW' : /^zh(?:-|$)/.test(language) ? 'zh-CN' : 'en';
}
