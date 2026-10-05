import {expect, it} from 'vitest';
import {eventKey} from './eventKey';

it('keys a stream.ready apart from the event whose cursor it repeats', () => {
  expect(eventKey({event: 'stream.ready', id: 'c1'})).not.toBe(eventKey({event: 'runtime.updated', id: 'c1'}));
});
