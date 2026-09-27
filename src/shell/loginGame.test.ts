import {describe, expect, it} from 'vitest';
import {DUCK_HEIGHT, FLAP_HEIGHT, GAP_MIN, SPACE_MIN, SPEED_MAX, amountText, level, rate, rateText} from './loginGame';

const stages = Array.from({length: 200}, (_, stage) => stage);

describe('the difficulty curve', () => {
  it('tightens at every stage without reaching the limits the flap can still clear', () => {
    for (const stage of stages.slice(1)) {
      const before = level(stage - 1);
      const now = level(stage);
      expect(now.speed).toBeGreaterThanOrEqual(before.speed);
      expect(now.gap).toBeLessThanOrEqual(before.gap);
      expect(now.space).toBeLessThanOrEqual(before.space);
      expect(now.swing).toBeGreaterThanOrEqual(before.swing);
    }
    for (const stage of stages) {
      const {speed, gap, space, swing} = level(stage);
      expect(speed).toBeLessThanOrEqual(SPEED_MAX);
      expect(gap).toBeGreaterThanOrEqual(GAP_MIN);
      expect(space).toBeGreaterThanOrEqual(SPACE_MIN);
      expect(swing).toBeLessThanOrEqual(34);
    }
    const first = level(0);
    expect([first.speed, first.gap, first.space, first.swing, first.drift]).toEqual([expect.closeTo(110), expect.closeTo(205), expect.closeTo(270), 0, false]);
  });
  it('keeps the narrowest gap wide enough to hold with one flap', () => {
    expect(GAP_MIN).toBeGreaterThanOrEqual(DUCK_HEIGHT + FLAP_HEIGHT);
  });
  it('drifts the gaps only from the Gbps stages on', () => {
    expect(stages.filter(stage => level(stage).drift)[0]).toBe(6);
    expect(rate(6)).toBe(1000);
  });
});

describe('the traffic', () => {
  it('raises the link rate at every stage, without end', () => {
    for (const stage of stages.slice(1)) expect(rate(stage)).toBeGreaterThan(rate(stage - 1));
  });
  it('names the link rate in Mbps, Gbps, Tbps and Pbps', () => {
    expect([0, 5, 6, 7, 8, 9, 10, 11, 21, 22].map(rateText)).toEqual([
      '100 Mbps',
      '650 Mbps',
      '1 Gbps',
      '1.5 Gbps',
      '2.5 Gbps',
      '4 Gbps',
      '6 Gbps',
      '10 Gbps',
      '1 Tbps',
      '1.5 Tbps'
    ]);
    expect(rateText(36)).toBe('1 Pbps');
    expect(rateText(46)).toBe('100 Pbps');
    expect(rateText(51)).toBe('1000 Pbps');
  });
  it('counts what was forwarded in MB, GB, TB and PB', () => {
    expect([0, 12.34, 999.4, 1000, 1234.5, 2.5e6, 7.25e9, 3e12].map(amountText)).toEqual([
      '0.0 MB',
      '12.3 MB',
      '999.4 MB',
      '1.00 GB',
      '1.23 GB',
      '2.50 TB',
      '7.25 PB',
      '3000.00 PB'
    ]);
  });
});
