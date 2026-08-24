import { bootstrap } from './bootstrap.js';

const code = await bootstrap({ checkOnly: true });
process.exit(code);
