const crypto = require('crypto');
const bcrypt = require('bcrypt');
const {
  findUserByEmail,
  createPasswordResetToken,
  findPasswordResetToken,
  markTokenAsUsed,
  deletePasswordResetTokensForUser,
  updateUserPassword,
} = require('../db');
const { sendPasswordResetEmail } = require('./mailService');

const TOKEN_EXPIRY_HOURS = 1;

/**
 * Generate a secure random token for password reset
 * @returns {string} A 32-byte hex token (64 characters)
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Request a password reset for a user
 * @param {string} email - User's email address
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function requestPasswordReset(email) {
  try {
    const user = await findUserByEmail(email);

    // For security, always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      return {
        success: true,
        message: 'If an account exists with that email, you will receive a password reset link.',
      };
    }

    // Only allow password reset for approved users
    if (!user.approved && !user.isAdmin) {
      return {
        success: true,
        message: 'If an account exists with that email, you will receive a password reset link.',
      };
    }

    // Delete any existing reset tokens for this user
    await deletePasswordResetTokensForUser(user.id);

    // Generate new token
    const token = generateResetToken();

    // Set expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Store token in database
    await createPasswordResetToken(user.id, token, expiresAt.toISOString());

    // Send reset email
    await sendPasswordResetEmail(user, token);

    return {
      success: true,
      message: 'If an account exists with that email, you will receive a password reset link.',
    };
  } catch (error) {
    console.error('Error requesting password reset:', error);
    throw error;
  }
}

/**
 * Validate a password reset token
 * @param {string} token - Reset token
 * @returns {Promise<{valid: boolean, userId?: number, error?: string}>}
 */
async function validateResetToken(token) {
  if (!token) {
    return { valid: false, error: 'Token is required' };
  }

  const resetToken = await findPasswordResetToken(token);

  if (!resetToken) {
    return { valid: false, error: 'Invalid or expired reset link' };
  }

  if (resetToken.used) {
    return { valid: false, error: 'This reset link has already been used' };
  }

  const expiresAt = new Date(resetToken.expiresAt);
  const now = new Date();

  if (now > expiresAt) {
    return { valid: false, error: 'This reset link has expired' };
  }

  return { valid: true, userId: resetToken.userId, tokenId: resetToken.id };
}

/**
 * Reset a user's password using a valid token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function resetPassword(token, newPassword) {
  // Validate token
  const validation = await validateResetToken(token);

  if (!validation.valid) {
    return {
      success: false,
      message: validation.error,
    };
  }

  // Validate password
  if (!newPassword || newPassword.length < 8) {
    return {
      success: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user's password
    await updateUserPassword(validation.userId, passwordHash);

    // Mark token as used (we keep it in the database for audit purposes)
    await markTokenAsUsed(validation.tokenId);

    return {
      success: true,
      message: 'Your password has been reset successfully',
    };
  } catch (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
}

module.exports = {
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  TOKEN_EXPIRY_HOURS,
};
