import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Radio, RadioGroup} from './Radio';

const group = (value: string | null, disabled?: boolean) =>
  renderToStaticMarkup(
    <RadioGroup label="Routing mode" description="Every mode keeps LAN traffic direct." value={value} onChange={() => {}}>
      <Radio value="bypass" label="Bypass mainland China" description="Mainland China connects directly." />
      <Radio value="global" label="Global proxy" isDisabled={disabled} />
    </RadioGroup>
  );

it('names each radio by its label and describes it by its help, and the group by its label and help', () => {
  const markup = group('bypass');
  const root = markup.match(/<div[^>]*role="radiogroup"[^>]*>/)![0];
  expect(markup).toContain(`id="${root.match(/aria-labelledby="([^"]+)"/)![1]}">Routing mode</span>`);
  expect(markup).toContain(`id="${root.match(/aria-describedby="([^" ]+)/)![1]}" slot="description">Every mode keeps LAN traffic direct.</span>`);
  const input = markup.match(/<input[^>]*value="bypass"[^>]*>/)![0];
  expect(markup).toContain(`id="${input.match(/aria-labelledby="([^"]+)"/)![1]}">Bypass mainland China</span>`);
  expect(markup).toContain(`id="${input.match(/aria-describedby="([^" ]+)/)![1]}" class="rp-label">Mainland China connects directly.</span>`);
  // A radio without help is described by the group's help alone.
  expect(markup.match(/<input[^>]*value="global"[^>]*>/)![0]).not.toMatch(/aria-describedby="_/);
});

it('selects the radio holding the value, and nothing for null', () => {
  expect(group('global').match(/<input[^>]*value="global"[^>]*>/)![0]).toContain('checked');
  expect(group(null)).not.toMatch(/<input[^>]*checked/);
});

it('marks a disabled radio on its row and its input', () => {
  const markup = group(null, true);
  expect(markup).toMatch(/<label[^>]*class="rp-radio"[^>]*data-disabled="true"[^>]*><span[^>]*><input[^>]*disabled[^>]*value="global"/);
});

it('keeps contextual help outside the radio label and associates its description', () => {
  const markup = renderToStaticMarkup(
    <RadioGroup label="Routing mode" value="single" onChange={() => {}}>
      <Radio value="single" label="Single proxy group" description="One group for all traffic." help={{title: 'Single proxy group', text: 'Details.'}} />
    </RadioGroup>
  );
  const input = markup.match(/<input[^>]*value="single"[^>]*>/)![0];
  expect(markup).toContain(`id="${input.match(/aria-labelledby="([^"]+)"/)![1]}">Single proxy group</span>`);
  expect(markup).toContain(`id="${input.match(/aria-describedby="([^" ]+)/)![1]}" class="rp-label">One group for all traffic.</span>`);
  expect(markup).toMatch(/<\/label><span[^>]*class="rp-tipwrap"[^>]*><button[^>]*class="[^"]*rp-help/);
  expect(markup.match(/<label[^>]*class="rp-radio"[^>]*>.*?<\/label>/)![0]).not.toContain('<button');
});
