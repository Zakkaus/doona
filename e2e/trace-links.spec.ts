import {detail, expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('a trace link fills in the form without running it', async ({page}) => {
  let traced = false;
  page.on('request', request => {
    if (request.url().includes('/routing/trace')) traced = true;
  });
  await page.goto('/#/rules?tab=trace&domain=example.com&dst_port=443&src_ip=10.0.0.2');
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('example.com');
  await expect(page.getByLabel('Destination port', {exact: true})).toHaveValue('443');
  // The source sits under the advanced fields, which open to show it.
  await expect(page.getByLabel('Source IP', {exact: true})).toHaveValue('10.0.0.2');
  await expect(page.getByRole('button', {name: 'Run trace', exact: true})).toBeEnabled();
  expect(traced).toBe(false);
});

test('a connection opens the trace of its target and source', async ({page}) => {
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Trace this connection', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=trace&network=tcp&domain=api\.telegram\.org&dst_ip=149\.154\.167\.220&dst_port=443&src_ip=10\.0\.0\.12$/);
  await expect(page.getByLabel('Domain', {exact: true})).toHaveValue('api.telegram.org');
  await expect(page.getByLabel('Destination IP', {exact: true})).toHaveValue('149.154.167.220');
  await expect(page.getByLabel('Source IP', {exact: true})).toHaveValue('10.0.0.12');
  // The link pushed history: Back returns to the connection.
  await page.goBack();
  await expect(page).toHaveURL(/#\/connections\?tab=list&id=1$/);
});
