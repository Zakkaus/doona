import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from 'react-aria-components';
import {keepsAsTyped, NumberField, numberFromText, refusesPaste, textFromNumber} from './NumberField';
import {Form} from './Form';

const field = (props: Partial<Parameters<typeof NumberField>[0]> = {}) =>
  renderToStaticMarkup(<NumberField label="Port" value={NaN} onChange={() => {}} {...props} />);
const input = (markup: string) => markup.match(/<input[^>]*>/)![0];
const stepper = (markup: string, slot: 'decrement' | 'increment') => markup.match(new RegExp(`<button[^>]*slot="${slot}"[^>]*>`))![0];

describe('NumberField', () => {
  it.each([
    {name: 'empty is unset', value: NaN, shown: ''},
    {name: 'a port has no grouping', value: 8080, shown: '8080'},
    {name: 'a large count has no grouping', value: 1234567, shown: '1234567'}
  ])('shows the value: $name', ({value, shown}) => {
    expect(input(field({value}))).toContain(`value="${shown}"`);
  });

  it.each([
    {name: 'empty steps both ways', value: NaN, minValue: 0, maxValue: 65535, step: 1, decrease: true, increase: true},
    {name: 'the minimum stops decrease', value: 0, minValue: 0, maxValue: 65535, step: 1, decrease: false, increase: true},
    {name: 'the maximum stops increase', value: 65535, minValue: 0, maxValue: 65535, step: 1, decrease: true, increase: false},
    {name: 'a step past the maximum stops increase', value: 10, minValue: 0, maxValue: 12, step: 5, decrease: true, increase: false},
    {name: 'a step within the maximum allows increase', value: 10, minValue: 0, maxValue: 15, step: 5, decrease: true, increase: true}
  ])('offers steps within its range: $name', ({decrease, increase, ...range}) => {
    const markup = field(range);
    expect(stepper(markup, 'decrement').includes('disabled')).toBe(!decrease);
    expect(stepper(markup, 'increment').includes('disabled')).toBe(!increase);
  });

  it('hides the stepper on request and keeps the TextField box', () => {
    const markup = field({hideStepper: true});
    expect(markup).not.toContain('<button');
    expect(markup).toMatch(/class="rp-input" data-size="M"/);
    expect(field()).toMatch(/class="rp-input stepped" data-size="M"/);
  });

  it('marks an error as invalid with its text under the field', () => {
    const markup = field({error: 'Enter a whole number.'});
    expect(markup).toContain('data-invalid="true"');
    expect(markup).toContain('Enter a whole number.');
  });

  it('takes disabled and required from its form, unless it says otherwise', () => {
    const inForm = renderToStaticMarkup(
      <Form isDisabled isRequired>
        <NumberField label="Port" value={1} onChange={() => {}} />
        <NumberField label="Other" value={1} onChange={() => {}} isDisabled={false} />
      </Form>
    );
    const [first, second] = inForm.match(/<input[^>]*>/g)!;
    expect(first).toContain('disabled');
    expect(second).not.toContain('disabled');
    expect(inForm.match(/aria-hidden="true"> \*<\/span>/g)).toHaveLength(2);
  });

  it.each(['zh-CN', 'zh-TW'])('names its steppers in %s through React Aria', locale => {
    const markup = renderToStaticMarkup(
      <I18nProvider locale={locale}>
        <NumberField label="Port" value={1} onChange={() => {}} />
      </I18nProvider>
    );
    const labels = [...markup.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(match => match[1]);
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label).toMatch(/\p{Script=Han}/u);
  });

  it.each([
    {text: '', value: NaN},
    {text: '443', value: 443},
    {text: ' 1.5 ', value: 1.5},
    {text: '0x10', value: NaN},
    {text: '30s', value: NaN}
  ])('reads a draft $text for the field and writes it back', ({text, value}) => {
    expect(numberFromText(text)).toBe(value);
    expect(textFromNumber(value)).toBe(Number.isNaN(value) ? '' : String(value));
  });

  it('passes on only the finished entry when 1, 2, 8 are typed into a field from 64', () => {
    const typed = ['1', '12', '128'].map(Number);
    expect(typed.filter(value => keepsAsTyped(value, {minValue: 64, maxValue: 4096, step: 1}))).toEqual([128]);
  });

  it.each([
    {name: 'inside the range', value: 128, range: {minValue: 64, maxValue: 4096, step: 1}, kept: true},
    {name: 'below the minimum', value: 12, range: {minValue: 64, step: 1}, kept: false},
    {name: 'above the maximum', value: 5000, range: {maxValue: 4096}, kept: false},
    {name: 'off a whole step', value: 123.5, range: {minValue: 0, step: 1}, kept: false},
    {name: 'on a step counted from the minimum', value: 7, range: {minValue: 2, step: 5}, kept: true},
    {name: 'without a range', value: -3.25, range: {}, kept: true}
  ])('keeps a typed number as it is only where React Aria would: $name', ({value, range, kept}) => {
    expect(keepsAsTyped(value, range)).toBe(kept);
  });

  // The check typing runs: a whole-number field takes no decimal separator.
  const wholeNumber = (text: string) => /^-?\d*$/.test(text);
  it.each([
    {name: 'a decimal over all the text', text: '123.5', whole: true, refused: true},
    {name: 'a whole number over all the text', text: ' 124 ', whole: true, refused: false},
    {name: 'a decimal into part of the text', text: '123.5', whole: false, refused: false}
  ])('refuses a paste the typing check would refuse: $name', ({text, whole, refused}) => {
    const selected = {value: '64', selectionStart: 0, selectionEnd: whole ? 2 : 1};
    expect(refusesPaste(selected, text, wholeNumber)).toBe(refused);
  });
});
