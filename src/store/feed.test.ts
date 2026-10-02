import {stubVisibleDocument} from './testHelpers';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createFeed} from './feed';
import {eventFeed, noticeFeed} from './logs';
import {createMockApi} from '../api/mock';
import type {ApiEvent} from '../api/model';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  stubVisibleDocument();
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
  expect(feed.getSnapshot()).toEqual({connected: true, records: [{id: 'third'}, {id: 'second'}], gaps: new Set(), pending: 0});
  expect(notify).toHaveBeenCalledOnce();
  stop();
});

it.each([
  {name: 'the default cadence', every: undefined, published: 10},
  {name: 'a slower record cadence', every: 250, published: 3}
])('publishes a busy stream at $name without losing records', ({every, published}) => {
  const feed = createFeed<{id: string}, {connected: boolean}>(1000, {connected: false}, 'ignore', {every});
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  // One record every 20 ms for a second.
  for (let i = 0; i < 50; i++) {
    feed.append({id: String(i)});
    vi.advanceTimersByTime(20);
  }
  expect(notify).toHaveBeenCalledTimes(published);
  vi.advanceTimersByTime(250);
  expect(feed.getSnapshot().records.map(record => record.id)).toEqual(Array.from({length: 50}, (_, i) => String(49 - i)));
  stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('publishes a status change within the default cadence while records wait for theirs', () => {
  const feed = createFeed<{id: string}, {error: string | null}>(10, {error: null}, 'ignore', {every: 250});
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  feed.append({id: 'first'});
  vi.advanceTimersByTime(50);
  feed.update({error: 'closed'});
  vi.advanceTimersByTime(99);
  expect(notify).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(feed.getSnapshot()).toMatchObject({error: 'closed', records: [{id: 'first'}]});
  // A record after a prompt publication does not pull the next one earlier than its own cadence.
  feed.append({id: 'second'});
  feed.update({error: null});
  feed.append({id: 'third'});
  vi.advanceTimersByTime(100);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(feed.getSnapshot().records.map(record => record.id)).toEqual(['third', 'second', 'first']);
  stop();
  expect(vi.getTimerCount()).toBe(0);
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
    ],
    gaps: new Set(),
    pending: 0
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
  expect(feed.getSnapshot()).toEqual({connected: true, records: [{id: 'first'}], gaps: new Set(), pending: 1});
  // The held count publishes on its own and keeps the list reference, so no row re-renders.
  const held = feed.getSnapshot().records;
  feed.append({id: 'third'});
  feed.append({id: 'fourth'});
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().pending).toBe(3);
  expect(feed.getSnapshot().records).toBe(held);
  feed.hold(false);
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toEqual([{id: 'fourth'}, {id: 'third'}]);
  expect(feed.getSnapshot().pending).toBe(0);
  stop();
});

it('clears the published list even while held', () => {
  const feed = createFeed<{id: string}, {connected: boolean}>(2, {connected: false}, 'ignore');
  const stop = feed.subscribe(vi.fn());
  feed.append({id: 'first'});
  vi.advanceTimersByTime(100);
  feed.hold(true);
  feed.append({id: 'second'});
  feed.clear();
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toEqual([]);
  expect(feed.getSnapshot().pending).toBe(0);
  stop();
});

it('keeps the record list on a status-only change and schedules nothing without subscribers', () => {
  const feed = createFeed<{id: string}, {connected: boolean}>(5, {connected: false}, 'ignore');
  feed.append({id: 'early'});
  expect(vi.getTimerCount()).toBe(0);
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  vi.advanceTimersByTime(100);
  const records = feed.getSnapshot().records;
  expect(records).toEqual([{id: 'early'}]);
  feed.update({connected: true});
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records).toBe(records);
  feed.update({connected: true});
  vi.advanceTimersByTime(100);
  expect(notify).toHaveBeenCalledTimes(2);
  stop();
});

it('keeps the last event when a resumed stream.ready carries its id', () => {
  const feed = eventFeed();
  const off = feed.subscribe(() => {});
  const observed_at = '2026-09-23T00:00:01Z';
  feed.append({
    id: 'c2',
    event: 'flow.updated',
    data: {instance_id: 'i', observed_at, resource_id: 'f1', revision: '1', href: '/api/v1/flows/f1'}
  } as unknown as ApiEvent);
  feed.append({id: 'c2', event: 'stream.ready', data: {instance_id: 'i', observed_at}} as ApiEvent);
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().records.map(event => event.event)).toEqual(['stream.ready', 'flow.updated']);
  off();
});

it('marks lost records after the newest one held and forgets the mark with that record', () => {
  const feed = createFeed<{id: string}, Record<string, never>>(2, {}, 'ignore');
  const stop = feed.subscribe(() => {});
  feed.markGap();
  feed.append({id: 'first'});
  feed.markGap();
  feed.append({id: 'second'});
  vi.advanceTimersByTime(100);
  expect([...feed.getSnapshot().gaps]).toEqual([{id: 'first'}]);
  // A held list keeps the marks it was published with.
  feed.hold(true);
  feed.markGap();
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().gaps.size).toBe(1);
  feed.hold(false);
  vi.advanceTimersByTime(100);
  expect([...feed.getSnapshot().gaps]).toEqual([{id: 'first'}, {id: 'second'}]);
  feed.append({id: 'third'});
  vi.advanceTimersByTime(100);
  expect([...feed.getSnapshot().gaps]).toEqual([{id: 'second'}]);
  feed.clear();
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot().gaps.size).toBe(0);
  stop();
});

it('keeps one notice feed per backend, so a page opened again lists its notices once each', () => {
  const api = createMockApi();
  const feed = noticeFeed(api);
  expect(noticeFeed(api)).toBe(feed);
  expect(noticeFeed(createMockApi())).not.toBe(feed);
  const notice = (id: string) => ({id, event: 'flow.gap', data: {instance_id: 'i', observed_at: '2026-09-23T00:00:01Z'}}) as unknown as ApiEvent;
  const shown = () => feed.getSnapshot().records.map(event => event.id);
  let off = feed.subscribe(() => {});
  feed.append(notice('a'));
  feed.append(notice('b'));
  vi.advanceTimersByTime(100);
  off();
  // Opened again, the page subscribes anew and the shared stream replays what it already received.
  off = noticeFeed(api).subscribe(() => {});
  expect(shown()).toEqual(['b', 'a']);
  feed.append(notice('a'));
  feed.append(notice('b'));
  feed.append(notice('c'));
  vi.advanceTimersByTime(100);
  expect(shown()).toEqual(['c', 'b', 'a']);
  off();
});

it('does not republish one shared event delivered by multiple notice consumers', () => {
  const feed = createFeed<{id: string}, Record<string, never>>(200, {}, 'replace');
  const notify = vi.fn();
  const stop = feed.subscribe(notify);
  const event = {id: 'shared'};
  feed.append(event);
  vi.advanceTimersByTime(100);
  const first = feed.getSnapshot();
  feed.append(event);
  feed.append(event);
  vi.advanceTimersByTime(100);
  expect(feed.getSnapshot()).toBe(first);
  expect(notify).toHaveBeenCalledOnce();
  stop();
});
