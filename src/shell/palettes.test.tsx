import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {LangContext, RewordingContext, translate, useT, type Key, type Lang} from '../i18n';
import {DEFAULT_PALETTE, paletteWords, type PaletteId} from './palettes';

function Message({messageKey}: {messageKey: Key}) {
  return useT()(messageKey);
}
const render = (lang: Lang, palette: PaletteId, key: Key) =>
  renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <RewordingContext.Provider value={paletteWords(palette)}>
        <Message messageKey={key} />
      </RewordingContext.Provider>
    </LangContext.Provider>
  );

it('reads the China palette words for its statuses and the catalogue words under the default palette', () => {
  expect(render('en', 'qiangguo/qiangguo', 'lifecycle.running')).toBe('Improving');
  expect(render('en', 'qiangguo/qiangguo', 'act.unavailable')).toBe('Severe test');
  expect(render('zh-TW', 'qiangguo/qiangguo', 'lifecycle.running')).toBe(translate('zh-TW', 'palette.qiangguoGood'));
  expect(render('zh-CN', 'qiangguo/qiangguo', 'lifecycle.degraded')).toBe(translate('zh-CN', 'palette.qiangguoBad'));
  expect(render('en', 'qiangguo/qiangguo', 'lifecycle.failed')).toBe('Failed');
  expect(render('en', 'qiangguo/qiangguo', 'theme.light')).toBe('Day shift');
  expect(render('en', 'qiangguo/qiangguo', 'theme.dark')).toBe('Night shift');
  expect(render('zh-TW', 'qiangguo/qiangguo', 'theme.dark')).toBe(translate('zh-TW', 'palette.qiangguoDark'));
  expect(render('en', DEFAULT_PALETTE, 'theme.light')).toBe('Light');
  expect(render('en', DEFAULT_PALETTE, 'lifecycle.running')).toBe('Running');
  expect(render('en', DEFAULT_PALETTE, 'act.unavailable')).toBe('Unavailable');
  expect(render('zh-TW', DEFAULT_PALETTE, 'lifecycle.running')).toBe(translate('zh-TW', 'lifecycle.running'));
  expect(render('zh-CN', DEFAULT_PALETTE, 'lifecycle.degraded')).toBe(translate('zh-CN', 'lifecycle.degraded'));
});
