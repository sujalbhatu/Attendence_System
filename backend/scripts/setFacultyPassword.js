/**
 * Reset a faculty account's password from the server shell.
 * Use it once after deploying to change the old demo login
 * (faculty@campus.edu / password123), which was published in the README.
 *
 *   npm run set-faculty-password -- faculty@campus.edu "a-new-long-password"
 */
import '../config.js';
import mongoose from 'mongoose';
import User from '../models/User.js';

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword || newPassword.length < 12) {
  console.error('Usage: npm run set-faculty-password -- <email> <new password, 12+ characters>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campustrack');
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) {
  console.error(`No faculty account with email ${email}`);
} else {
  user.password = newPassword; // hashed by the User pre-save hook
  await user.save();
  console.log(`Password updated for ${email}`);
}
await mongoose.disconnect();
