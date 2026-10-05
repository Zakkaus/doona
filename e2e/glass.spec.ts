import type {Page} from '@playwright/test';
import {expect, paletteBoxes, test} from './fixtures';

const flavours = ['glass', 'clear', 'frosted', 'tinted'] as const;
// Glass and Clear draw the sidebar and the bar's capsules as glass of their own; Frosted and Tinted share one chrome sheet.
const floats = (flavour: (typeof flavours)[number]) => flavour === 'glass' || flavour === 'clear';

// The page's own cards: the startup screen and a loading page draw inert skeleton cards in the same classes.
const pageCard = '.rp-card:not([inert] *)';

// The opaque check reads rgb() as alpha 1 and rgba() by its last channel.
const surface = (page: Page, selector: string, pseudo?: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element, pseudo) => {
      const style = getComputedStyle(element, pseudo);
      const alpha = style.backgroundColor.startsWith('rgba(') ? Number(style.backgroundColor.match(/,\s*([\d.]+)\)$/)?.[1]) : 1;
      return {filter: style.backdropFilter, alpha};
    }, pseudo);

test('the palette menu offers the four Glass materials in order, and Settings has no material switch', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('.rp-top').getByRole('button', {name: 'Palette', exact: true}).click();
  await expect(page.getByRole('menuitemradio', {name: /^(Liquid Glass|Glass|Frosted|Tinted)/})).toContainText(['Liquid Glass', 'Glass', 'Frosted', 'Tinted']);
  await page.getByRole('menuitemradio', {name: /^Frosted/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-flavour', 'frosted');
  const card = page.getByRole('region', {name: 'Appearance', exact: true});
  await expect((await paletteBoxes(page)).getByRole('option', {name: 'Glass Frosted'})).toHaveAttribute('aria-selected', 'true');
  await expect(card.getByRole('radiogroup', {name: /material/i})).toHaveCount(0);
});

// Glass kept its material in doona-glass before each material was a palette; the first paint moves it once.
for (const [material, flavour] of [
  ['frosted', 'frosted'],
  ['tinted', 'tinted'],
  ['clear', 'glass']
] as const)
  test(`a stored ${material} Glass material becomes the ${flavour} palette`, async ({page}) => {
    await page.addInitScript(value => {
      if (sessionStorage.getItem('migrated')) return;
      sessionStorage.setItem('migrated', '1');
      localStorage.setItem('doona-palette', 'glass/glass');
      localStorage.setItem('doona-glass', value);
    }, material);
    await page.goto('/#/activity');
    await expect(page.locator('html')).toHaveAttribute('data-flavour', flavour);
    expect(await page.evaluate(() => [localStorage.getItem('doona-palette'), localStorage.getItem('doona-glass')])).toEqual([`glass/${flavour}`, null]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-flavour', flavour);
  });

for (const flavour of flavours)
  test(`${flavour} frosts the chrome, cards and menus as its material says`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
    await page.goto('/#/nodes?provider=harbor');
    await expect(page.locator(pageCard).first()).toBeVisible();
    const chrome = floats(flavour) ? await surface(page, '.rp-side', '::before') : await surface(page, '.rp-shell', '::after');
    // A card's material is its ::before.
    const card = await surface(page, pageCard, '::before');
    if (flavour === 'tinted') {
      expect(chrome.filter).toBe('none');
      expect(card.filter).toBe('none');
      expect(card.alpha).toBeGreaterThanOrEqual(0.85);
    } else {
      expect(chrome.filter).toContain('blur');
      expect(card.filter).toContain('blur');
      expect(card.alpha).toBeLessThan(0.7);
    }
    await page.getByRole('button', {name: /Group$/}).click();
    await expect(page.locator('.rp-popover').first()).toBeVisible();
    expect((await surface(page, '.rp-popover')).filter === 'none').toBe(flavour === 'tinted');
  });

// Nothing is drawn round a card's edge: no rim layer over the backdrop, and no border, inset shadow or gradient, any of
// which would sit inside its overflow clip and read as a ring. In Chromium's Glass the lens bends the backdrop at the
// edge; elsewhere the Glass card is blur and fill alone. Tinted has no backdrop-filter.
for (const flavour of flavours)
  test(`${flavour} draws no line round its card edge`, async ({page, browserName}) => {
    await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
    await page.goto('/#/activity');
    await expect(page.locator(pageCard).first()).toBeVisible();
    const edge = await page
      .locator('.rp-card')
      .first()
      .evaluate(element => {
        const style = getComputedStyle(element);
        const material = getComputedStyle(element, '::before');
        return {
          // The material reaches the border box, so no band of bare backdrop opens at the edge.
          material: [material.top, material.left, material.right, material.bottom],
          filter: material.backdropFilter,
          after: getComputedStyle(element, '::after').backdropFilter,
          shadow: style.boxShadow,
          image: style.backgroundImage,
          border: style.borderTopWidth
        };
      });
    expect(edge.shadow).not.toContain('inset');
    expect(edge.image).not.toMatch(/gradient\(/);
    expect(edge.border).toBe('0px');
    expect(edge.material).toEqual(['0px', '0px', '0px', '0px']);
    expect(edge.after).toBe('none');
    if (flavour === 'tinted') expect(edge.filter).toBe('none');
    else expect(edge.filter).toContain('blur');
    if (flavour === 'glass' && browserName === 'chromium') expect(edge.filter).toContain('url("#doona-lens")');
    else expect(edge.filter).not.toContain('url(');
  });

// The phone's bottom bar takes the chrome's material: blurred where the material blurs, near solid where it does not.
for (const flavour of flavours)
  test(`${flavour} gives the phone's bottom bar the chrome's material`, async ({page}) => {
    await page.setViewportSize({width: 393, height: 659});
    await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
    await page.goto('/#/policies');
    await expect(page.locator('.rp-hubbar')).toBeVisible();
    const bar = await surface(page, '.rp-hubbar');
    if (flavour === 'tinted') expect(bar.alpha).toBeGreaterThanOrEqual(0.9);
    else expect(bar.filter).toContain('blur');
    // The lower half thickens towards the solid chrome, where the blur fades at the viewport's edge.
    expect(await page.locator('.rp-hubbar').evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient(');
  });

// Chromium refracts through the lens filters; cards, the floating panel and menus reference them, and they exist once.
test.describe('glass lens', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'only Chromium applies an SVG filter in backdrop-filter');
  test.use({widgets: true, storage: {'doona-palette': 'glass/glass'}});
  test('bends cards, the floating panel and menus', async ({page}) => {
    await page.goto('/#/nodes?provider=harbor');
    await expect(page.locator('html')).toHaveAttribute('data-lens', '');
    await expect(page.locator('svg filter#doona-lens feDisplacementMap')).toHaveCount(1);
    await expect(page.locator('svg filter#doona-lens-sm')).toHaveCount(1);
    // The specular brightens the bent backdrop by arithmetic, not by laying an image of light over it.
    await expect(page.locator('svg filter#doona-lens feComposite[operator="arithmetic"]')).toHaveCount(1);
    await expect(page.locator('svg filter feComposite[operator="over"]')).toHaveCount(0);
    const panel = page.locator('.rp-floating-frame .rp-floating-panel');
    await expect(panel).toBeVisible();
    expect((await surface(page, '.rp-floating-frame .rp-floating-panel')).filter).toContain('url("#doona-lens")');
    // Cards and the sidebar are the panel's glass; the top bar's small capsules keep a plain blur.
    expect((await surface(page, `.rp-content ${pageCard}`, '::before')).filter).toContain('url("#doona-lens")');
    expect((await surface(page, '.rp-side', '::before')).filter).toContain('url("#doona-lens")');
    for (const selector of ['.rp-search', '.rp-actions']) expect((await surface(page, selector, '::before')).filter).toMatch(/^blur\(/);
    await page.getByRole('button', {name: /Group$/}).click();
    await expect(page.locator('.rp-popover').first()).toBeVisible();
    expect((await surface(page, '.rp-popover')).filter).toContain('url("#doona-lens-sm")');
  });
  // At 32px the lens shows only as a bright rim, so controls on the wallpaper keep the cards' fill with a plain blur.
  test('keeps controls on the wallpaper to a plain blur', async ({page}) => {
    await page.goto('/#/logs');
    await expect(page.locator('.rp-main .rp-selectbtn').first()).toBeVisible();
    for (const selector of ['.rp-main .rp-selectbtn', '.rp-main .rp-input']) {
      const {filter} = await surface(page, selector);
      expect(filter, selector).toMatch(/^blur\(/);
      expect(filter, selector).not.toContain('url(');
    }
  });
});
// Clear is Glass as Firefox and Safari draw it, offered in every browser: the lens is never loaded or marked.
test.describe('clear glass', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'the lens only exists in Chromium; elsewhere Glass already draws this');
  test.use({widgets: true, storage: {'doona-palette': 'glass/clear'}});
  test.beforeEach(async ({page}) =>
    page.addInitScript(() => {
      requestAnimationFrame(() => {
        const d = document.documentElement;
        (window as unknown as {firstFrame: string}).firstFrame = `${d.dataset.family}/${d.dataset.flavour} ${d.hasAttribute('data-lens')}`;
      });
    })
  );
  const appearance = (page: Page) => page.getByRole('region', {name: 'Appearance', exact: true});
  test('draws blur and fill without the lens, with the wallpaper and blur settings', async ({page}) => {
    await page.goto('/#/settings?tab=appearance');
    expect(await page.waitForFunction(() => (window as unknown as {firstFrame?: string}).firstFrame).then(value => value.jsonValue())).toBe(
      'glass/clear false'
    );
    await expect(page.locator(pageCard).first()).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-lens');
    await expect(page.locator('svg filter')).toHaveCount(0);
    for (const [selector, pseudo] of [
      ['.rp-card', '::before'],
      ['.rp-side', '::before'],
      ['.rp-floating-frame .rp-floating-panel', undefined]
    ] as const) {
      const {filter} = await surface(page, selector, pseudo);
      expect(filter, selector).toContain('blur');
      expect(filter, selector).not.toContain('url(');
    }
    await expect(appearance(page).getByRole('group', {name: 'Wallpaper'})).toBeVisible();
    await expect(appearance(page).getByRole('slider', {name: 'Blur'})).toBeVisible();
    await page.reload();
    expect(await page.waitForFunction(() => (window as unknown as {firstFrame?: string}).firstFrame).then(value => value.jsonValue())).toBe(
      'glass/clear false'
    );
    await expect(page.locator('html')).toHaveAttribute('data-flavour', 'clear');
  });
  test('leaves no lens behind when Glass gives way to it', async ({page}) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('doona-palette', 'glass/glass');
      }
    });
    await page.goto('/#/settings');
    await expect(page.locator('html')).toHaveAttribute('data-lens', '');
    await (await paletteBoxes(page)).getByRole('option', {name: 'Glass', exact: true}).click({force: true});
    await expect(page.locator('html')).toHaveAttribute('data-flavour', 'clear');
    await expect(page.locator('html')).not.toHaveAttribute('data-lens');
    expect((await surface(page, pageCard, '::before')).filter).not.toContain('url(');
  });
});

// Liquid Glass says it refracts only in Chromium wherever it is offered, and Settings spells it out once it is picked.
test('the palette pickers note that Liquid Glass refracts only in Chromium', async ({page}) => {
  await page.goto('/#/settings');
  await page.locator('.rp-top').getByRole('button', {name: 'Palette', exact: true}).click();
  await expect(page.getByRole('menuitemradio', {name: /^Liquid Glass/})).toContainText('Chromium only');
  await page.keyboard.press('Escape');
  const group = await paletteBoxes(page);
  const field = page.locator('[data-setting="palette"]');
  const liquid = group.getByRole('option', {name: 'Liquid Glass', exact: true});
  await expect(liquid).toHaveAccessibleDescription('Chromium only');
  const note = 'Needs a Chromium browser; Firefox and Safari show Glass';
  await expect(field.getByText(note)).toHaveCount(0);
  await liquid.click({force: true});
  await expect(field.getByText(note)).toBeVisible();
  await expect(group).toHaveAccessibleDescription(note);
});

test.describe('glass lens elsewhere', () => {
  test.use({widgets: true, storage: {'doona-palette': 'glass/frosted'}});
  test('stays off in the other materials', async ({page}) => {
    await page.goto('/#/activity');
    await expect(page.locator('.rp-floating-frame .rp-floating-panel')).toBeVisible();
    expect((await surface(page, '.rp-floating-frame .rp-floating-panel')).filter).not.toContain('url(');
  });
});

// Glass floats its chrome as the cards' glass, with no sheet behind the content, so cards float on the wallpaper; the
// content keeps the boxes it has over Frosted's sheet. The top bar draws no material: the search field and the icon
// group are capsules of the cards' fill and blur, and the sidebar is a card. Without the lens all of it is plain blur.
test('glass floats the top bar capsules and the sidebar as the card glass', async ({page, browserName}) => {
  const boxes = async (flavour: string) => {
    await page.evaluate(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-flavour', flavour);
    await expect(page.locator(pageCard).first()).toBeVisible();
    return page.locator(pageCard).evaluateAll(cards => cards.slice(0, 8).map(card => JSON.stringify(card.getBoundingClientRect())));
  };
  await page.goto('/#/activity');
  const frosted = await boxes('frosted');
  expect(await boxes('clear')).toEqual(frosted);
  expect(await boxes('glass')).toEqual(frosted);
  const main = await page.locator('.rp-main').evaluate(element => {
    const style = getComputedStyle(element);
    return {filter: style.backdropFilter, background: style.backgroundColor};
  });
  expect(main).toEqual({filter: 'none', background: 'rgba(0, 0, 0, 0)'});
  const bar = await page
    .locator('.rp-top')
    .evaluate(element =>
      [getComputedStyle(element), getComputedStyle(element, '::before')].map(style => ({filter: style.backdropFilter, background: style.backgroundColor}))
    );
  expect(bar).toEqual([
    {filter: 'none', background: 'rgba(0, 0, 0, 0)'},
    {filter: 'none', background: 'rgba(0, 0, 0, 0)'}
  ]);
  const fill = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate(element => getComputedStyle(element, '::before').backgroundColor);
  const card = await fill('.rp-content .rp-card');
  const cardFilter = (await surface(page, `.rp-content ${pageCard}`, '::before')).filter;
  for (const selector of ['.rp-search', '.rp-actions']) {
    expect(await fill(selector), selector).toBe(card);
    expect((await surface(page, selector, '::before')).filter, selector).toMatch(/^blur\(/);
  }
  expect(await fill('.rp-side')).toBe(card);
  expect((await surface(page, '.rp-side', '::before')).filter).toBe(cardFilter);
  if (browserName !== 'chromium') expect(cardFilter).not.toContain('url(');
  // The scroll edge under the bar shows only once the page has scrolled.
  const edge = () => page.locator('.rp-shell').evaluate(element => getComputedStyle(element, '::after').visibility);
  expect(await edge()).toBe('hidden');
  expect((await surface(page, '.rp-shell', '::after')).filter).toMatch(/^blur\(/);
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(edge).toBe('visible');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(edge).toBe('hidden');
});

// Router UIs such as LuCI embed doona in an iframe with rounded corners. Chrome then dropped the chrome sheet's concave
// clip and blurred the whole content box away, while hit testing still found the page under it.
test.describe('embedded in a rounded iframe', () => {
  test.use({storage: {'doona-palette': 'glass/glass', 'doona-scheme': 'light'}});
  test('glass leaves the page title painted', async ({page}) => {
    await page.setViewportSize({width: 1240, height: 700});
    await page.route('**/embed.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><style>body{margin:0}iframe{display:block;width:1180px;height:650px;border:1px solid #ccc;border-radius:4px}</style><iframe src="/#/activity"></iframe>'
      })
    );
    await page.goto('/embed.html');
    const title = page.frameLocator('iframe').getByRole('heading', {level: 1});
    await expect(title).toHaveText('Activity');
    // The darkest pixel of the title's box as the screen shows it, whatever covers the heading: ink when painted, the
    // pale sheet when covered.
    const shot = await title.screenshot();
    const darkest = await page.evaluate(
      async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const {data} = context.getImageData(0, 0, image.width, image.height);
        let min = 255;
        for (let i = 0; i < data.length; i += 4) min = Math.min(min, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        return min;
      },
      `data:image/png;base64,${shot.toString('base64')}`
    );
    expect(darkest).toBeLessThan(100);
  });
});

// Reduce Transparency and Increase Contrast turn every material solid. Playwright cannot emulate the first media
// feature, so the Chromium DevTools protocol sets both.
test.describe('reduce transparency and increase contrast', () => {
  test.skip(({browserName}) => browserName !== 'chromium', 'the media features are emulated through CDP');
  for (const feature of ['prefers-reduced-transparency', 'prefers-contrast'])
    for (const flavour of flavours)
      test(`${feature} makes ${flavour} solid`, async ({page}) => {
        await page.addInitScript(value => localStorage.setItem('doona-palette', `glass/${value}`), flavour);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', {features: [{name: feature, value: feature === 'prefers-contrast' ? 'more' : 'reduce'}]});
        await page.goto('/#/nodes?provider=harbor');
        await expect(page.locator(pageCard).first()).toBeVisible();
        const opaque = {filter: 'none', alpha: 1};
        // The sidebar and top bar sit on the shell's chrome sheet; in Glass the sidebar and the bar's capsules are glass of their own.
        if (floats(flavour))
          for (const selector of ['.rp-side', '.rp-search', '.rp-actions']) expect(await surface(page, selector, '::before')).toMatchObject(opaque);
        else expect(await surface(page, '.rp-shell', '::after')).toMatchObject(opaque);
        expect(await surface(page, pageCard, '::before')).toMatchObject(opaque);
        // The card's edge is a solid border.
        expect(
          await page
            .locator('.rp-card')
            .first()
            .evaluate(element => getComputedStyle(element).borderTopWidth)
        ).toBe('1px');
        await page.getByRole('button', {name: /Group$/}).click();
        await expect(page.locator('.rp-popover').first()).toBeVisible();
        expect(await surface(page, '.rp-popover')).toMatchObject(opaque);
      });
});
