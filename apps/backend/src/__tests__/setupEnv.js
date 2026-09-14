// Side-effect-only module: sets required env vars BEFORE config.js/db.js
// get a chance to run. config.js throws synchronously if SESSION_SECRET is
// missing, and db.js opens a SQLite file under config.dataDir as soon as
// it's imported (default /srv/ccaas/data, which a normal dev/CI user can't
// write to) -- so every test file that (transitively) imports config.js,
// db.js, or session.js must `import './setupEnv.js'` as its FIRST import.
//
// ES module evaluation runs each import's whole dependency graph before
// moving to the next import in the importing file, so as long as this is
// the first import line in a test file, these env vars are guaranteed to
// be set before config.js's module body (which reads them) ever runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SESSION_SECRET ||= 'test-session-secret-do-not-use-in-prod';
process.env.DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'ccaas-test-'));
