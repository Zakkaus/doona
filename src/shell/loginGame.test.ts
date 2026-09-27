import {describe, expect, it} from 'vitest';
import {DUCK_HEIGHT, FLAP_HEIGHT, GAP_MIN, SPACE_MIN, SPEED_MAX, amountText, idleLayout, level, loadingDots, rate, rateText} from './loginGame';

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

describe('the idle scene', () => {
  it('shows all three dots on a still, then steps through none to three every half second', () => {
    expect([0, 0.49, 0.5, 1, 1.5, 2, 2.5].map(loadingDots)).toEqual([3, 3, 0, 1, 2, 3, 0]);
  });
  it('centres the bar and the duck as one group on a shared ground, and the whole stack in the panel', () => {
    // The panel beside the form at 1440px and at 1024px, the narrowest that shows it, in logical units.
    for (const [w, h] of [
      [600, 643],
      [360, 549]
    ]) {
      const L = idleLayout(w, h);
      const right = 2 * L.duck - (L.x + L.bar + 22);
      expect(Math.abs(L.post + right - 2 * L.cx)).toBeLessThanOrEqual(1);
      expect(L.top + 22).toBe(L.ground);
      expect(L.x - L.post).toBe(L.board + 24);
      expect(L.cx - L.reach).toBeGreaterThanOrEqual(12);
      expect(L.cx + L.reach).toBeLessThanOrEqual(w - 12);
      expect(L.shrink).toBe(1);
      expect(Math.abs(L.head + L.start + 4 - h)).toBeLessThanOrEqual(1);
    }
    expect(idleLayout(600, 643).bar).toBe(250);
    expect(idleLayout(360, 549).bar).toBeLessThan(250);
  });
  it('keeps the loading row whole on a narrow panel and shrinks the group to fit instead', () => {
    // English at 1024px: a wide board and a long label need more room than the panel has.
    const L = idleLayout(360, 549, {board: 121, row: 223});
    expect(L.bar).toBe(223);
    expect(L.shrink).toBeLessThan(1);
    expect(L.cx - L.shrink * L.reach).toBeGreaterThanOrEqual(12 - 0.5);
    expect(L.cx + L.shrink * L.reach).toBeLessThanOrEqual(360 - 12 + 0.5);
  });
});
