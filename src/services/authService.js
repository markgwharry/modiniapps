const bcrypt = require('bcrypt');
const { createUser, findUserByEmail, findUserById } = require('../db');

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
  return { id: user.id, email: user.email, isAdmin: user.isAdmin, approved: user.approved, createdAt: user.createdAt };
}

function sanitizeUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, isAdmin: user.isAdmin, approved: user.approved, createdAt: user.createdAt };
}

module.exports = {
  registerUser,
  authenticateUser,
  sanitizeUser,
  findUserById,
};
