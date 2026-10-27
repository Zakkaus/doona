const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const copy = {
  'en-US': {
    createGroup: 'Create group',
    name: 'Name',
    create: 'Create',
    created: 'Created',
    actions: 'Actions',
    copy: 'Copy members to…',
    target: 'Target group',
    save: 'Save',
    add: 'Add'
  },
  'zh-CN': {
    createGroup: '创建组',
    name: '名称',
    create: '创建',
    created: '已创建',
    actions: '操作',
    copy: '复制成员到…',
    target: '目标组',
    save: '保存',
    add: '添加'
  },
  'zh-TW': {
    createGroup: '建立群組',
    name: '名稱',
    create: '建立',
    created: '已建立',
    actions: '操作',
    copy: '複製成員到…',
    target: '目標群組',
    save: '儲存',
    add: '新增'
  }
};
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
  });
}
async function run(browser) {
  for (const [locale, reducedMotion] of [
    ['en-US', 'no-preference'],
    ['en-US', 'reduce'],
    ['zh-CN', 'no-preference'],
    ['zh-TW', 'no-preference']
  ]) {
    const p = await browser.newPage({locale, reducedMotion, colorScheme: 'light', viewport: {width: 1440, height: 900}});
    const t = copy[locale];
    await p.addInitScript(locale => localStorage.setItem('doona-lite.locale', locale === 'en-US' ? 'en' : locale), locale);
    await p.goto(base);
    await waitForDemo(p);
    await settle(p);
    await p.evaluate(() => {
      window.groupMotion = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        window.groupMotion.push({id: options?.id, group: this.getAttribute('data-group-row'), member: this.getAttribute('data-member-filter')});
        return animate.call(this, frames, options);
      };
    });
    const name = 'motion-group';
    await p.getByRole('button', {name: t.createGroup, exact: true}).click();
    await p.getByRole('textbox', {name: t.name, exact: true}).fill(name);
    await p.getByRole('button', {name: t.create, exact: true}).click();
    const row = p.locator(`[data-group-row="${name}"]`);
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(row).toBeInViewport();
    await expect(p.getByRole('region').getByText(`${t.created} ${name}`, {exact: true})).toBeVisible();
    async function motion(attribute, value, added) {
      const calls = await p.evaluate(({attribute, value}) => window.groupMotion.filter(call => call[attribute] === value).map(call => call.id), {
        attribute,
        value
      });
      expect(calls.filter(id => id === 'row-highlight')).toHaveLength(reducedMotion === 'reduce' ? 0 : 1);
      expect(calls.filter(id => id === 'row-enter')).toHaveLength(reducedMotion === 'reduce' || !added ? 0 : 1);
      expect(calls).not.toContain('item-move');
    }
    async function shot(label) {
      if (locale !== 'zh-CN' || !process.env.LITE_SHOTS) return;
      fs.mkdirSync(process.env.LITE_SHOTS, {recursive: true});
      await p.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter(a => !['row-enter', 'row-highlight'].includes(a.id) && a.effect.getTiming().iterations !== Infinity)
            .map(a => a.finished.catch(() => {}))
        );
      });
      await p.screenshot({path: path.join(process.env.LITE_SHOTS, `${label}-1440-900-zh-CN-light.png`)});
    }
    await motion('group', name, true);
    await shot('group-created');
    const editor = p.locator(`[data-group-editor="${name}"]`);
    await editor.waitFor();
    await settle(p);
    const available = editor.locator('[data-transfer="available"]');
    const members = editor.locator('[data-transfer="members"]');
    await p.evaluate(() => (window.groupMotion = []));
    await available.locator('[data-add-member]:not([aria-haspopup])').first().click();
    let member = members.locator('[data-member-filter]').last();
    await expect(member).toBeFocused();
    await expect(member).toBeInViewport();
    await motion('member', await member.getAttribute('data-member-filter'), true);
    await shot('member-added');
    await settle(p);
    await p.evaluate(() => (window.groupMotion = []));
    await available.locator('[data-add-member][aria-haspopup="dialog"]').first().click();
    await p.locator('[data-bind-popover]').getByRole('button', {name: t.add, exact: true}).click();
    member = members.locator('[data-member-filter]').last();
    await expect(member).toBeFocused();
    await expect(member).toBeInViewport();
    await motion('member', await member.getAttribute('data-member-filter'), true);
    if (locale === 'en-US') {
      for (let index = 2; index < 11; index++) {
        await settle(p);
        await p.evaluate(() => (window.groupMotion = []));
        await available.locator('[data-add-member]:not([aria-haspopup])').first().click();
        member = members.locator('[data-member-filter]').last();
        await expect(member).toBeFocused();
        await expect(member).toBeInViewport();
        await motion('member', await member.getAttribute('data-member-filter'), true);
      }
      await expect(members.locator('[data-member-filter]')).toHaveCount(1);
      await settle(p);
      await p.evaluate(() => (window.groupMotion = []));
      await member.getByRole('button', {name: /^Remove:/}).click();
      await expect(members.locator('[data-member-filter]')).toHaveCount(10);
      expect(await p.evaluate(() => window.groupMotion.filter(call => call.member))).toEqual([]);
      await expect(available.locator('[data-add-member]').first()).toBeFocused();
    }
    await p.getByRole('textbox').first().fill(name);
    await editor.getByRole('button', {name: `${t.actions}: ${name}`, exact: true}).click();
    await p.getByRole('menuitem', {name: t.copy, exact: true}).click();
    await p.getByRole('combobox', {name: t.target, exact: true}).click();
    await p.getByRole('option', {name: 'backup', exact: true}).click();
    await settle(p);
    await p.evaluate(() => (window.groupMotion = []));
    await p.getByRole('button', {name: t.save, exact: true}).click();
    const target = p.locator('[data-group-row="backup"]');
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
    await motion('group', 'backup', false);
    if (reducedMotion === 'reduce') expect(await p.evaluate(() => document.getAnimations().length)).toBe(0);
    console.log(`PASS groups create/member/subscription/copy reveal, focus and viewport: ${locale}, ${reducedMotion}`);
    await p.close();
  }
}
module.exports = run;
if (require.main === module) {
  (async () => {
    const browser = await chromium.launch();
    try {
      await run(browser);
    } finally {
      await browser.close();
    }
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
