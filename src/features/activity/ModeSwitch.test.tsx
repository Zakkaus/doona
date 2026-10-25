import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModeApply, ModeCards} from './ModeSwitch';
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

import type {ReactElement} from 'react';
import {hookHarness} from '../../store/testHelpers';
const control = vi.hoisted(() => ({testing: false}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => (control.testing ? hookHarness.hooks.useState(initial) : actual.useState(initial))
  };
});
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});
it.each(['direct', 'global', 'rule'])('confirms %s mode before applying, with cancellation preserving the draft', mode => {
  control.testing = true;
  hookHarness.reset();
  const apply = vi.fn();
  const model = {mode, modes: [[mode, mode]] as Array<[string, string]>, writable: true, dirty: true, incomplete: false, busy: false, apply};
  const read = () =>
    hookHarness.render(() => ModeApply({model})) as ReactElement<{
      children: [ReactElement<{onPress: () => void}>, ReactElement<{isOpen: boolean; title: string; onCancel: () => void; onConfirm: () => void}>];
    }>;
  try {
    read().props.children[0].props.onPress();
    if (mode === 'rule') expect(apply).toHaveBeenCalledOnce();
    else {
      expect(apply).not.toHaveBeenCalled();
      expect(read().props.children[1].props).toMatchObject({isOpen: true, title: `Apply ${mode} mode?`});
      read().props.children[1].props.onCancel();
      expect(apply).not.toHaveBeenCalled();
      expect(read().props.children[1].props.isOpen).toBe(false);
      read().props.children[0].props.onPress();
      read().props.children[1].props.onConfirm();
      expect(apply).toHaveBeenCalledOnce();
    }
  } finally {
    control.testing = false;
  }
});
