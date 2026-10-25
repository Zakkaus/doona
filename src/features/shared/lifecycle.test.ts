import {expect, it, vi} from 'vitest';
import {translate, type Translator, type Lang} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);
import {lifecycleActions} from './lifecycle';

it('retains a pending operation even when lifecycle state stops offering it', () => {
  const run = vi.fn();
  const actions = lifecycleActions(kind => kind === 'resume', 'suspend', run, t);
  expect(actions.map(action => [action.id, action.isPending, action.isDisabled])).toEqual([
    ['suspend', true, true],
    ['resume', false, true]
  ]);
  actions[1].onAction();
  expect(run).toHaveBeenCalledWith('resume');
});

import {useLifecycle} from './useLifecycle';
import {toast} from '../../ui/ui';

let lang: Lang = 'en';
vi.mock('../../i18n', async original => ({
  ...(await original<typeof import('../../i18n')>()),
  useT: () => (key: Parameters<Translator>[0], params: Parameters<Translator>[1]) => translate(lang, key, params)
}));
vi.mock('../../store', () => ({
  useRuntimeOperations: () => ({canRun: () => true, busy: null, run: async () => ({operation_id: 'op-1'})})
}));
vi.mock('../../ui/ui', () => ({toast: vi.fn(), toastFailure: vi.fn()}));

it.each([
  ['en', 'Reload: Completed'],
  ['zh-TW', '重載：已完成'],
  ['zh-CN', '重载：已完成']
] as const)('omits the operation id from the %s lifecycle toast', async (locale, message) => {
  lang = locale;
  vi.mocked(toast).mockClear();
  useLifecycle(undefined, undefined, vi.fn()).run('reload');
  await Promise.resolve();
  expect(toast).toHaveBeenCalledExactlyOnceWith('positive', message);
});
