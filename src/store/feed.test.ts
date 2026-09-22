import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createFeed} from './feed';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden: false}));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('publishes a bounded batch once and ignores replayed log ids', () => {
  const feed = createFeed<{id: string}, {connected: boolean}>(2, {connected: false}, 'ignore');
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  feed.append({id: 'first'});
  feed.append({id: 'second'});
  feed.append({id: 'first'});
  feed.append({id: 'third'});
  feed.update({connected: true});
  vi.advanceTimersByTime(99);
  expect(notify).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(feed.getSnapshot()).toEqual({connected: true, records: [{id: 'third'}, {id: 'second'}]});
  expect(notify).toHaveBeenCalledOnce();
  stop();
});

it('buffers events and status while hidden, then publishes one current snapshot', () => {
  const feed = createFeed<{id: string; value: number}, {connected: boolean}>(2, {connected: false}, 'replace');
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  feed.append({id: 'first', value: 1});
  Object.assign(document, {hidden: true});
  document.dispatchEvent(new Event('visibilitychange'));
  feed.append({id: 'second', value: 2});
  feed.append({id: 'first', value: 3});
  feed.update({connected: true});
  vi.advanceTimersByTime(10000);
  expect(notify).not.toHaveBeenCalled();
  expect(feed.getSnapshot().records).toEqual([]);
  Object.assign(document, {hidden: false});
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(10000);
  expect(notify).toHaveBeenCalledOnce();
  expect(feed.getSnapshot()).toEqual({
    connected: true,
    records: [
      {id: 'first', value: 3},
      {id: 'second', value: 2}
    ]
  });
  feed.clear();
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toEqual([]);
  feed.append({id: 'first', value: 4});
  stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('holds the published list while paused and shows what arrived meanwhile on resume', () => {
  const feed = createFeed<{id: string}, {connected: boolean}>(2, {connected: false}, 'ignore');
  const stop = feed.subscribe(vi.fn());
  feed.append({id: 'first'});
  vi.advanceTimersByTime(100);
  feed.hold(true);
  feed.append({id: 'second'});
  feed.update({connected: true});
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot()).toEqual({connected: true, records: [{id: 'first'}]});
  feed.append({id: 'third'});
  feed.hold(false);
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toEqual([{id: 'third'}, {id: 'second'}]);
  stop();
});

it('clears the published list even while held', () => {
  const feed = createFeed<{id: string}, {connected: boolean}>(2, {connected: false}, 'ignore');
  const stop = feed.subscribe(vi.fn());
  feed.append({id: 'first'});
  vi.advanceTimersByTime(100);
  feed.hold(true);
  feed.clear();
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toEqual([]);
  stop();
});
