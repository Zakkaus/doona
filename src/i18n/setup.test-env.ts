import {loadLanguage} from './index';

// Unit tests render in every language; the app itself loads only the one it shows.
await Promise.all([loadLanguage('zh-TW'), loadLanguage('zh-CN'), loadLanguage('en')]);
