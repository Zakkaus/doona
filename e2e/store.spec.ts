import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({viewport: {width: 1440, height: 1000}});

test('Test all completes a group larger than the advertised job ceiling', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  const group = await api.group('skylink');
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'skylink', exact: true});
  await card.getByRole('button', {name: 'Test all', exact: true}).click();
  await expect(page.locator('.rp-toast.positive').filter({hasText: /skylink.*available.*selection/})).toBeVisible();
  const jobs = requests
    .filter(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/probes'))
    .map(request => request.postDataJSON());
  expect(jobs.map(job => job.members.length)).toEqual([64, 36]);
  expect(jobs.flatMap(job => job.members)).toEqual(group.members.map(member => member.id));
  await expect(card.getByRole('button', {name: 'Test all', exact: true})).toBeEnabled();
});

test('a failed second probe batch reports partial completion instead of success', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let jobs = 0;
  handlers['POST probes'] = request => {
    if (++jobs === 2) throw new ApiError(422, 'unsupported_value', 'Batch refused');
    return api.startProbe(request.postDataJSON());
  };
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'skylink', exact: true});
  await card.getByRole('button', {name: 'Test all', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('64/100');
  await expect(page.locator('.rp-toast.positive')).toHaveCount(0);
  await expect(card.getByRole('button', {name: 'Test all', exact: true})).toBeEnabled();
});

test('a hidden main-source path does not block a validated conditional replacement', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    return {...config, sources: config.sources.map(source => ({...source, path: '<redacted>'}))};
  };
  handlers['POST config/validate'] = async request => {
    const candidate = request.postDataJSON();
    if (candidate.mode === 'full')
      return {
        valid: false,
        generation_id: '40',
        validated_at: new Date().toISOString(),
        diagnostics: [
          {level: 'error', source_id: 'src-main', line: null, column: null, span: null, code: 'include_not_found', message: 'No include-resolution base'}
        ]
      };
    return api.validateConfig(candidate);
  };
  await page.goto('/#/config?tab=source&source=src-main');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await editor.fill(main.content! + '\n# updated\n');
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('configuration reloaded');
  expect(requests.filter(request => request.method() === 'PUT' && request.url().includes('/config/sources/'))).toHaveLength(1);
  expect((await api.config()).sources.find(source => source.kind === 'main')?.content).toContain('# updated');
});

test('query simulation refuses DNS fan-out above the advertised address limit', async ({page}) => {
  const {api, capabilities, handlers, requests} = await mockBackend(page);
  capabilities.resources.routing_trace.resolve_modes = ['none'];
  capabilities.resources.routing_trace.max_addresses = 1;
  handlers['GET dns/query'] = request => {
    const params = new URL(request.url()).searchParams;
    return api.dnsQuery(params.get('domain')!, params.getAll('type'));
  };
  handlers['POST routing/trace'] = request => api.routingTrace(request.postDataJSON());
  await page.goto('/#/rules?tab=trace');
  await page.getByLabel('Domain', {exact: true}).fill('trace.example');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  await expect(page.getByText(/DNS returned more than 1 distinct addresses/)).toBeVisible();
  expect(requests.filter(request => request.method() === 'POST' && request.url().endsWith('/routing/trace'))).toHaveLength(0);
});
