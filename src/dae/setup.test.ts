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

it('removes the section with its last subscription unless comments remain in it', () => {
  const text = "global {\n  log_level: info\n}\n\nsubscription {\n  sub-a: 'https://a.example/sub'\n}\n\ngroup { proxy {} }\n";
  expect(writeState(text, {...readState(text), subscriptions: []})).toBe('global {\n  log_level: info\n}\n\ngroup { proxy {} }\n');
  const state = readState(commented);
  expect(writeState(commented, {...state, subscriptions: state.subscriptions.filter(item => !isSubscriptionRow(item))})).toBe(
    'subscription {\n  # paid plan, renewed yearly\n}\ngroup { proxy {} }\n'
  );
});
