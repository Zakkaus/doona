// Playwright serves separate demo and production builds and passes each browser check its matching preview URL.
const base = process.env.LITE_PREVIEW_URL;
if (!base) throw new Error('Run the browser checks with `pnpm test:browser`.');
module.exports = base.replace(/\/$/, '');
