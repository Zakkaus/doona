import type {Lang} from './index';

// Shown only when no catalogue loads, so it cannot come from one: the problem and the retry button.
export const unloaded: Record<Lang, [string, string]> = {
  'zh-TW': ['無法載入介面文字。', '重試'],
  'zh-CN': ['无法加载界面文字。', '重试'],
  en: ['The interface text could not be loaded.', 'Retry']
};
