import { writeFileSync } from 'node:fs';
import { defaultAssumptions } from '../src/engine/defaults';
writeFileSync(process.argv[2], JSON.stringify(defaultAssumptions(), null, 1));
