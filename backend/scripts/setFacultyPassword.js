/**
 * Reset a faculty account's password from the server shell.
 * Use it once after deploying to change the old demo login
 * (faculty@campus.edu / password123), which was published in the README.
 *
 *   npm run set-faculty-password -- faculty@campus.edu "a-new-long-password"
 */
import '../config.js';
import { closePool } from '../db/index.js';
import { setUserPassword } from '../repositories/users.js';

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword || newPassword.length < 12) {
  console.error('Usage: npm run set-faculty-password -- <email> <new password, 12+ characters>');
  process.exit(1);
}

try {
  if (await setUserPassword(email, newPassword)) {
    console.log(`Password updated for ${email}`);
  } else {
    console.error(`No faculty account with email ${email}`);
    process.exitCode = 1;
  }
} finally {
  await closePool();
}
