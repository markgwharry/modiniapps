const bcrypt = require('bcrypt');
const { findUserById, updateUserApproval, updateUserPassword, setUserApps } = require('../db');
const { generateTemporaryPassword } = require('../utils/password');
const { sendUserApprovalEmail } = require('./mailService');

async function approvePendingUser(userId, allowedApps = []) {
  const user = await findUserById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await updateUserPassword(userId, passwordHash);
  await updateUserApproval(userId, true);
  await setUserApps(userId, Array.isArray(allowedApps) ? allowedApps : []);
  const approvedUser = await findUserById(userId);
  await sendUserApprovalEmail(approvedUser, temporaryPassword);
  return { user: approvedUser, temporaryPassword };
}

module.exports = {
  approvePendingUser,
};
