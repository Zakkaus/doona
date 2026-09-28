import {REFERENCE_LANG, type CompleteLang, type Lang} from './languages';

type Texts = [problem: string, retry: string];
// Shown only when no catalogue loads, so it cannot come from one: the problem and the retry button. A partial
// language may leave its entry out and show English.
const texts: Record<CompleteLang, Texts> & Partial<Record<Lang, Texts>> = {
  'zh-TW': ['無法載入介面文字。', '重試'],
  'zh-CN': ['无法加载界面文字。', '重试'],
  en: ['The interface text could not be loaded.', 'Retry']
};
export const unloaded = (lang: Lang): Texts => (texts as Partial<Record<Lang, Texts>>)[lang] ?? texts[REFERENCE_LANG];
