import {expect, it} from 'vitest';
import {levelHeatmap} from './heatmap';

const at = (minute: number, level: 'error' | 'warn' | 'info' | 'debug') => ({ts: new Date(Date.UTC(2026, 8, 23, 10, minute)).toISOString(), level});
const levels = ['error', 'warn', 'info', 'debug'] as const;

it('counts records per level per bucket, keeping empty buckets', () => {
  const map = levelHeatmap([at(0, 'info'), at(1, 'info'), at(30, 'warn'), at(59, 'info')], [...levels], 'info');
  expect(map.rows.map(row => row.level)).toEqual(['error', 'warn', 'info']);
  expect(map.buckets.length).toBeGreaterThan(3);
  const info = map.rows[2].counts;
  expect(info.reduce((a, b) => a + b)).toBe(3);
  expect(info.filter(count => count === 0).length).toBeGreaterThan(0);
  expect(map.busiest).toMatchObject({count: 2, errors: 0});
});

it('points the summary at the bucket with the most errors when there are any', () => {
  const map = levelHeatmap([at(0, 'info'), at(0, 'info'), at(0, 'info'), at(40, 'error'), at(41, 'error')], [...levels], 'debug');
  expect(map.busiest).toMatchObject({count: 2, errors: 2});
  expect(map.rows.map(row => row.level)).toEqual(['error', 'warn', 'info', 'debug']);
});

it('has no rows for levels below the minimum and nothing to summarise without records', () => {
  expect(levelHeatmap([], [...levels], 'warn')).toMatchObject({buckets: [], busiest: null, rows: [{level: 'error'}, {level: 'warn'}]});
});
