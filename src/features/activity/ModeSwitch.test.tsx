import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModeCards} from './ModeSwitch';
import {LangContext} from '../../i18n';

it.each([
  {writable: true, dirty: true, incomplete: false, busy: false, disabled: false},
  {writable: true, dirty: false, incomplete: false, busy: false, disabled: true},
  {writable: true, dirty: true, incomplete: true, busy: false, disabled: true},
  {writable: true, dirty: true, incomplete: false, busy: true, disabled: true},
  {writable: false, dirty: true, incomplete: false, busy: false, disabled: null}
])('standalone Global Apply respects $writable, $dirty, $incomplete and $busy', state => {
  const noop = () => {};
  const markup = renderToStaticMarkup(
    <LangContext.Provider value="en">
      <ModeCards
        part="global"
        model={{
          ...state,
          mode: 'global',
          target: 'gaming',
          targetText: 'gaming',
          status: 'Read-only',
          readOnly: !state.writable,
          modes: [],
          targets: [{id: 'gaming', label: 'gaming'}],
          reasons: {mode: null, global: null},
          error: null,
          retry: noop,
          pick: noop,
          pickTarget: noop,
          apply: noop
        }}
      />
    </LangContext.Provider>
  );
  const apply = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/gs)].map(match => match[0]).find(button => button.includes('Apply'));
  if (state.disabled === null) expect(apply).toBeUndefined();
  else {
    expect(apply).toBeDefined();
    expect(/\bdisabled=""|aria-disabled="true"/.test(apply!)).toBe(state.disabled);
  }
});
