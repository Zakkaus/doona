import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TextArea} from './TextArea';
import {Form} from './Form';
it('renders three lines and associates the label, description and error with the textarea', () => {
  const markup = renderToStaticMarkup(
    <Form>
      <TextArea label="Node links" value="bad" description="One link per line" error="Invalid link" />
    </Form>
  );
  const input = markup.match(/<textarea[^>]+>/)![0];
  expect(input).toContain('rows="3"');
  expect(input).toContain('aria-invalid="true"');
  const described = input.match(/aria-describedby="([^"]+)"/)![1].split(' ');
  expect(described).toContain(markup.match(/class="rp-field-error" id="([^"]+)"/)![1]);
  expect(markup).toContain('One link per line');
  expect(markup).toContain('Node links');
  expect(markup).not.toContain('<input');
});
