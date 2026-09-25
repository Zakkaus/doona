import {expect, it, vi} from 'vitest';
import {ApiError} from '../api/error';
import {capabilities} from '../api/mock/fixtures';
import type {Api} from '../api/api';
import type {DnsLogList, DnsLogQuery} from '../api/model';
import {dnsLogLimit, dnsLogPage} from './dns';

const page: DnsLogList = {observed_at: '2026-09-25T10:00:00Z', total: 3, next_cursor: null, records: []};
const budget = () => new ApiError(503, 'temporarily_unavailable', 'DNS log response exceeds the projection budget', 'r1', null, 1);
const logApi = (dnsLog: (query?: DnsLogQuery) => Promise<DnsLogList>) => ({dnsLog: vi.fn(dnsLog)}) as unknown as Api & {dnsLog: ReturnType<typeof vi.fn>};

it('asks for the backend default page, not the advertised maximum', () => {
  expect(dnsLogLimit({...capabilities, resources: {...capabilities.resources, dns_log: {...capabilities.resources.dns_log, max_page_size: 500}}})).toBe(100);
  expect(dnsLogLimit({...capabilities, resources: {...capabilities.resources, dns_log: {...capabilities.resources.dns_log, max_page_size: 40}}})).toBe(40);
  expect(dnsLogLimit(undefined)).toBeUndefined();
});

it('retries a page the backend refused as too large once, at a quarter of the size', async () => {
  const api = logApi(async query => {
    if (query?.limit === 100) throw budget();
    return page;
  });
  await expect(dnsLogPage(api, {limit: 100, cursor: 'c'})).resolves.toBe(page);
  expect(api.dnsLog.mock.calls.map(([query]) => query)).toEqual([
    {limit: 100, cursor: 'c'},
    {limit: 25, cursor: 'c'}
  ]);
});

it('passes on other failures, a second refusal and a page of one', async () => {
  const internal = new ApiError(500, 'internal', 'boom');
  const failing = logApi(async () => {
    throw internal;
  });
  await expect(dnsLogPage(failing, {limit: 100})).rejects.toBe(internal);
  expect(failing.dnsLog).toHaveBeenCalledTimes(1);
  const refusing = logApi(async () => {
    throw budget();
  });
  await expect(dnsLogPage(refusing, {limit: 100})).rejects.toMatchObject({status: 503});
  expect(refusing.dnsLog).toHaveBeenCalledTimes(2);
  const single = logApi(async () => {
    throw budget();
  });
  await expect(dnsLogPage(single, {limit: 1})).rejects.toMatchObject({status: 503});
  expect(single.dnsLog).toHaveBeenCalledTimes(1);
});
