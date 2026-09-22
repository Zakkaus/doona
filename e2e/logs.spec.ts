import {downloadText, expect, fulfillStream, mockBackend, test} from './fixtures';

test('logs filter the stream, pause incoming rows, export and clear', async ({page}) => {
  const {api} = await mockBackend(page);
  const runtime = await api.runtime();
  const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at};
  const records = [
    {id: 'log:1', level: 'info', target: 'honk::dns', message: 'DNS answered'},
    {id: 'log:2', level: 'warn', target: 'honk::dns', message: 'DNS slow'},
    {id: 'log:3', level: 'error', target: 'honk::routing', message: 'Route failed'}
  ];
  let sent = 0;
  await page.route('**/api/v1/logs?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const levels = ['trace', 'debug', 'info', 'warn', 'error'];
    const selected = records.filter(
      record => levels.indexOf(record.level) >= levels.indexOf(params.get('level')!) && record.target.startsWith(params.get('target') ?? '')
    );
    await fulfillStream(route, [
      {id: 'ready:0', event: 'stream.ready', data},
      ...selected.map(record => ({
        id: record.id,
        event: 'log',
        data: {ts: runtime.observed_at, level: record.level, target: record.target, message: record.message, fields: null}
      }))
    ]);
    sent++;
  });
  await page.goto('/#/logs');
  const rows = page.getByRole('grid', {name: 'Logs'}).getByRole('rowheader');
  await expect(rows).toHaveText(['Route failed', 'DNS slow', 'DNS answered']);
  await page.getByRole('button', {name: 'info Level', exact: true}).click();
  await page.getByRole('option', {name: 'warn', exact: true}).click();
  await expect(rows).toHaveText(['Route failed', 'DNS slow']);
  await page.getByRole('searchbox', {name: 'Module', exact: true}).fill('honk::dns');
  await expect(rows).toHaveText(['DNS slow']);
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  records.push({id: 'log:4', level: 'warn', target: 'honk::dns', message: 'Ignored while paused'});
  const before = sent;
  await expect.poll(() => sent).toBeGreaterThan(before);
  await expect(rows).toHaveText(['DNS slow']);
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  records.splice(3, 1, {id: 'log:5', level: 'warn', target: 'honk::dns', message: 'Received after resume'});
  await expect(rows).toHaveText(['Received after resume', 'DNS slow']);
  await page.getByRole('switch', {name: 'Pause', exact: true}).press('Space');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export', exact: true}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^honk-log-.*\.txt$/);
  expect((await downloadText(download)).trim().split('\n')).toEqual([
    `${runtime.observed_at} WARN  honk::dns DNS slow`,
    `${runtime.observed_at} WARN  honk::dns Received after resume`
  ]);
  await page.getByRole('button', {name: 'Clear', exact: true}).filter({hasText: 'Clear'}).click();
  await expect(rows.filter({hasText: /DNS slow|Received after resume/})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Export', exact: true})).toBeDisabled();
});
