const bcrypt = require('bcrypt');
const {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByIdWithPassword,
  updateUserPassword,
} = require('../db');

async function registerUser(email, password) {
  const normalisedEmail = email.trim().toLowerCase();
  const existing = await findUserByEmail(normalisedEmail);
  if (existing) {
    const error = new Error('Email already registered');
    error.code = 'USER_EXISTS';
    throw error;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser(normalisedEmail, passwordHash);
  return user;
}

async function authenticateUser(email, password) {
  const normalisedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalisedEmail);
  if (!user) {
    const error = new Error('Invalid credentials');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    const error = new Error('Invalid credentials');
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }
  // Check if user is approved (admins are always approved)
  if (!user.isAdmin && !user.approved) {
    const error = new Error('Account pending approval');
    error.code = 'PENDING_APPROVAL';
    throw error;
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName || '',
    jobTitle: user.jobTitle || '',
    phone: user.phone || '',
    isAdmin: user.isAdmin,
    approved: user.approved,
    createdAt: user.createdAt,
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName || '',
    jobTitle: user.jobTitle || '',
    phone: user.phone || '',
    isAdmin: user.isAdmin,
    approved: user.approved,
    createdAt: user.createdAt,
  };
}

async function verifyUserPassword(userId, password) {
  const user = await findUserByIdWithPassword(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    const error = new Error('Current password invalid');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }
  return sanitizeUser(user);
}

async function changeUserPassword(userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(userId, passwordHash);
  const user = await findUserById(userId);
  return sanitizeUser(user);
}

module.exports = {
  registerUser,
  authenticateUser,
  sanitizeUser,
  findUserById,
  verifyUserPassword,
  changeUserPassword,
};
