import {expect, it, vi} from 'vitest';
import {translate, type Translator} from '../../i18n';
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
