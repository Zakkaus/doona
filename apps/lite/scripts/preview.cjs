// The browser checks run under `pnpm test:browser`, whose Playwright webServer starts the preview and passes its URL.
const base = process.env.LITE_PREVIEW_URL;
if (!base) throw new Error('Run the browser checks with `pnpm test:browser`.');
module.exports = base.replace(/\/$/, '');
