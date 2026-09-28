import {describe, expect, it} from 'vitest';
import {languageFiles} from './offline';

const files = [
  {name: 'assets/fonts-cjk-1.css', catalogue: null, sources: ['src/fonts-cjk.css']},
  {name: 'assets/index-1.js', catalogue: null, sources: []},
  {name: 'assets/locale-en-1.js', catalogue: 'en', sources: []},
  {name: 'assets/locale-ja-1.js', catalogue: 'ja', sources: []},
  {name: 'assets/locale-zz-1.js', catalogue: 'zz', sources: []}
];

describe('languageFiles', () => {
  it('lists each language its catalogue and stylesheet, and a partial one the reference files too', () => {
    const languages = [
      {id: 'en', fonts: null, complete: true},
      {id: 'ja', fonts: 'cjk', complete: true},
      {id: 'zz', fonts: 'cjk', complete: false}
    ];
    expect(languageFiles(files, languages, 'en')).toEqual({
      en: ['assets/locale-en-1.js'],
      ja: ['assets/fonts-cjk-1.css', 'assets/locale-ja-1.js'],
      zz: ['assets/fonts-cjk-1.css', 'assets/locale-en-1.js', 'assets/locale-zz-1.js']
    });
  });

  it('gives each shipped language only its own files', () => {
    const lists = languageFiles([
      {name: 'assets/fonts-tc-1.css', catalogue: null, sources: ['src/fonts-tc.css']},
      {name: 'assets/fonts-sc-1.css', catalogue: null, sources: ['src/fonts-sc.css']},
      {name: 'assets/locale-zh-TW-1.js', catalogue: 'zh-TW', sources: []},
      {name: 'assets/locale-zh-CN-1.js', catalogue: 'zh-CN', sources: []},
      {name: 'assets/locale-en-1.js', catalogue: 'en', sources: []}
    ]);
    expect(lists).toEqual({
      'zh-TW': ['assets/fonts-tc-1.css', 'assets/locale-zh-TW-1.js'],
      'zh-CN': ['assets/fonts-sc-1.css', 'assets/locale-zh-CN-1.js'],
      en: ['assets/locale-en-1.js']
    });
  });
});
