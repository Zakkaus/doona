import type {Page, Request} from '@playwright/test';
import {ApiError} from '../src/api/error';
import {expect, expectLoadFailures, mockBackend, test} from './fixtures';

// These calls carry no idempotency key, so doona never retries them: a failure is shown, the control stays, and the
// person presses it again (selectGroup, clearGroupOverride, flushDnsCache, deleteDnsEntry, deleteProvider, deleteNode).
const failures = {
  '429': () => new ApiError(429, 'rate_limited', 'Too many requests', null, null, 1),
  '503': () => new ApiError(503, 'backend_unavailable', 'Backend is busy'),
  network: null
} as const;
type Failure = keyof typeof failures;

type Pass = (request: Request) => Promise<unknown>;
// Fails the first `method` request to `path` the given way and answers later ones with `pass`; returns the requests
// seen, so a spec can tell a retry from a single attempt.
async function failOnce(page: Page, handlers: Record<string, Pass>, method: string, path: string, how: Failure, pass: Pass) {
  const url = new RegExp(`/api/v1/${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?|$)`);
  const seen: string[] = [];
  page.on('request', request => {
    if (request.method() === method && url.test(request.url())) seen.push(request.url());
  });
  let failed = false;
  const make = failures[how];
  handlers[`${method} ${path}`] = async request => {
    if (make && !failed) {
      failed = true;
      throw make();
    }
    return pass(request);
  };
  if (!make) {
    expectLoadFailures(page, url);
    await page.route(url, route => {
      if (!failed && route.request().method() === method) {
        failed = true;
        return route.abort('failed');
      }
      return route.fallback();
    });
  }
  return seen;
}

const shown = (page: Page) => page.locator('.rp-toast.negative, [role="alertdialog"] [role="alert"], main [role="alert"]').first();

test.use({viewport: {width: 1440, height: 1000}});

for (const how of Object.keys(failures) as Failure[])
  test.describe(`on ${how === 'network' ? 'a network failure' : how}`, () => {
    test('selecting a group member reports the failure and can be pressed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      const counted = await failOnce(page, handlers, 'PUT', 'groups/proxy/selection', how, request => api.selectGroup('proxy', request.postDataJSON()));
      await page.goto('/#/policies');
      const member = page.getByRole('region', {name: 'proxy', exact: true}).getByRole('button', {name: /^sg-01\b/});
      await member.click();
      await expect(shown(page)).toBeVisible();
      await expect(member).toHaveAttribute('aria-pressed', 'false');
      expect(counted).toHaveLength(1);
      await expect(member).toBeEnabled();
      await member.click();
      await expect(member).toHaveAttribute('aria-pressed', 'true');
      expect(counted).toHaveLength(2);
    });

    test('releasing a pinned member reports the failure and can be pressed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      await api.selectGroup('resilient', {member_id: 'us-01', network: 'tcp'});
      const counted = await failOnce(page, handlers, 'DELETE', 'groups/resilient/selection', how, request =>
        api.clearGroupOverride('resilient', new URL(request.url()).searchParams.get('network') as 'tcp')
      );
      await page.goto('/#/policies');
      const group = page.getByRole('region', {name: 'resilient', exact: true});
      await group.getByRole('radio', {name: 'TCP', exact: true}).click();
      const release = group.getByRole('button', {name: 'Back to automatic', exact: true});
      await release.click();
      await expect(shown(page)).toBeVisible();
      expect(counted).toHaveLength(1);
      await expect(release).toBeEnabled();
      await release.click();
      await expect(group.getByText('Automatic', {exact: true})).toBeVisible();
      expect(counted).toHaveLength(2);
    });

    test('flushing the DNS cache reports the failure and can be confirmed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      const counted = await failOnce(page, handlers, 'POST', 'dns/cache/flush', how, () => api.flushDnsCache());
      await page.goto('/#/dns?tab=cache');
      await page.getByRole('button', {name: 'Clear all cache', exact: true}).click();
      const dialog = page.getByRole('alertdialog', {name: 'Clear all cache', exact: true});
      const confirm = dialog.getByRole('button', {name: 'Clear all cache', exact: true});
      await confirm.click();
      await expect(shown(page)).toBeVisible();
      expect(counted).toHaveLength(1);
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page.getByText('No cache entries', {exact: true})).toBeVisible();
      expect(counted).toHaveLength(2);
    });

    test('deleting a DNS cache entry reports the failure and can be pressed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      const entry = (await api.dnsCache()).entries[0]!;
      const counted = await failOnce(page, handlers, 'DELETE', `dns/cache/${entry.entry_id}`, how, () => api.deleteDnsEntry(entry.entry_id));
      await page.goto('/#/dns?tab=cache');
      const remove = page.getByRole('button', {name: `Delete the ${entry.type} cache entry for ${entry.domain}`, exact: true});
      await remove.click();
      await expect(shown(page)).toBeVisible();
      expect(counted).toHaveLength(1);
      await expect(remove).toBeEnabled();
      await remove.click();
      await expect(remove).toHaveCount(0);
      expect(counted).toHaveLength(2);
    });

    test('removing a subscription reports the failure and can be confirmed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      const provider = (await api.providers()).providers.find(item => item.kind !== 'inline')!;
      const counted = await failOnce(page, handlers, 'DELETE', `providers/${provider.id}`, how, () => api.deleteProvider(provider.id));
      await page.goto('/#/nodes?tab=list');
      await page.getByRole('button', {name: `Remove ${provider.name}`, exact: true}).click();
      const dialog = page.getByRole('alertdialog');
      const confirm = dialog.getByRole('button', {name: `Remove ${provider.name}`, exact: true});
      await confirm.click();
      await expect(shown(page)).toBeVisible();
      expect(counted).toHaveLength(1);
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page.locator('.rp-toast.positive')).toBeVisible();
      expect(counted).toHaveLength(2);
    });

    test('removing an inline node reports the failure and can be confirmed again', async ({page}) => {
      const {api, handlers} = await mockBackend(page);
      const node = await api.createNode({name: 'hk-09', link: 'anytls://demo@edge.example.net:443'});
      const counted = await failOnce(page, handlers, 'DELETE', `nodes/${node.id}`, how, () => api.deleteNode(node.id));
      await page.goto('/#/nodes?provider=inline');
      await page.getByRole('button', {name: 'Remove hk-09', exact: true}).click();
      const dialog = page.getByRole('alertdialog');
      const confirm = dialog.getByRole('button', {name: 'Remove hk-09', exact: true});
      await confirm.click();
      await expect(shown(page)).toBeVisible();
      expect(counted).toHaveLength(1);
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page.locator('.rp-toast.positive')).toBeVisible();
      expect(counted).toHaveLength(2);
    });
  });
