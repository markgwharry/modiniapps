const bcrypt = require('bcrypt');
const { findUserById, updateUserApproval, updateUserPassword } = require('../db');
const { generateTemporaryPassword } = require('../utils/password');
const { sendUserApprovalEmail } = require('./mailService');

async function approvePendingUser(userId) {
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
  const approvedUser = { ...user, approved: true };
  await sendUserApprovalEmail(approvedUser, temporaryPassword);
  return { user: approvedUser, temporaryPassword };
}

module.exports = {
  approvePendingUser,
};
