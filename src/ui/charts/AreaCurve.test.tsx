import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Curve} from './AreaCurve';

it('wires null breaks and three-digit precision into both d3 paths', () => {
  const markup = renderToStaticMarkup(
    <Curve points={[{x: 0, y: 1.23456}, null, {x: 2, y: 2}, {x: 3, y: 3}]} baseline={4} color="red" id="fill" strokeWidth={2} />
  );
  expect(markup).toContain('d="M0,1.235L0,4ZM2,2L3,3L3,4L2,4Z"');
  expect(markup).toContain('d="M0,1.235ZM2,2L3,3"');
});

it('wires monotone-X interpolation into the curve', () => {
  const markup = renderToStaticMarkup(
    <Curve
      points={[
        {x: 0, y: 0},
        {x: 3, y: 3},
        {x: 6, y: 0}
      ]}
      baseline={6}
      color="red"
      id="fill"
      strokeWidth={2}
    />
  );
  expect(markup).toContain('d="M0,0C1,1.5,2,3,3,3C4,3,5,1.5,6,0"');
});
