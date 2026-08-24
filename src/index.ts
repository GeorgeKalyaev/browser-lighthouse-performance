import { bootstrap } from './bootstrap.js';

const code = await bootstrap({ checkOnly: false });
// Explicit exit avoids lingering Playwright handles crashing Node on Windows.
process.exit(code);
