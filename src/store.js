// -----------------------------------------------------------------------------
// The Dreo session under /data (the only writable path of the container): the
// access token and the region of the account, so a restart does not log in
// again — Dreo logins are few and far between, like the app's. The token is a
// secret: the file is only readable by the container user, and it is never
// logged. It is bound to a hash of the e-mail address, so a new account in the
// configuration never reuses the token of the previous one. Losing the file is
// harmless: the next start logs in again.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { IssueLog } from './issues.js';

const logger = createLogger({ name: 'dreo-store' });
const FILE_NAME = 'dreo-session.json';

/** Never the address itself: the hash only tells whether the account changed. */
export function accountKey(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

export class SessionStore {
  constructor(directory = process.env.DREO_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    // A read-only or full /data fails every write: logged once.
    this.issues = new IssueLog(logger);
  }

  /** The stored session of this account, or null. */
  async load(email) {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      if (data?.account === accountKey(email) && typeof data.token === 'string' && data.token) {
        return { token: data.token, region: data.region === 'us' ? 'us' : 'eu' };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read the Dreo session file: ${err.message}`);
      }
    }
    return null;
  }

  /** Atomic write (temporary file + rename): a crash never leaves half a file. */
  async save(email, session) {
    try {
      await mkdir(this.directory, { recursive: true });
      const temporary = `${this.path}.tmp`;
      const body = JSON.stringify({
        account: accountKey(email),
        region: session.region,
        token: session.token,
      });
      await writeFile(temporary, body, { mode: 0o600 });
      await rename(temporary, this.path);
      this.issues.recover('write', 'The Dreo session file is written again');
    } catch (err) {
      this.issues.fail('write', `Cannot write the Dreo session file: ${err.message}`);
    }
  }

  async clear(email) {
    await this.save(email, { region: 'eu', token: '' });
  }
}
