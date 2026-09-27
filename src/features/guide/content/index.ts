import type {Lang} from '../../../i18n';
import type {GuideContent} from '../types';

// One chunk per language, so the guide loads only the language it shows.
export const guideContent: Record<Lang, () => Promise<GuideContent>> = {
  'zh-TW': () => import('./zh-TW').then(module => module.content),
  'zh-CN': () => import('./zh-CN').then(module => module.content),
  en: () => import('./en').then(module => module.content)
};
