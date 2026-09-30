import {expect, it} from 'vitest';
import {isSubscriptionRow, readState, writeState} from './setup';

const commented = `subscription {
  # paid plan, renewed yearly
  sub-a: 'https://a.example/sub'
  'https://b.example/sub'
}
group { proxy {} }
`;

it('lists subscriptions, a bare URL included, but not the comments between them', () => {
  const state = readState(commented);
  expect(state.subscriptions.filter(isSubscriptionRow).map(item => item.name || item.raw?.trim())).toEqual(['sub-a', "'https://b.example/sub'"]);
  expect(writeState(commented, state)).toBe(commented);
  const rest = writeState(commented, {...state, subscriptions: state.subscriptions.filter(item => item.name !== 'sub-a')});
  expect(rest).toBe("subscription {\n  # paid plan, renewed yearly\n  'https://b.example/sub'\n}\ngroup { proxy {} }\n");
});
