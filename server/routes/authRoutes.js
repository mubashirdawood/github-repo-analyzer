import express from 'express';
import {
  signup,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import {
  listSessions,
  logoutSession,
  logoutAllSessions,
  logoutCurrent,
} from '../controllers/sessionController.js';
import { refreshAccessToken } from '../controllers/refreshController.js';
import {
  getAccount,
  changePassword,
  changeEmail,
  resendMyVerification,
  getSecurityActivity,
  exportAccountData,
  deleteAccount,
} from '../controllers/accountController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  authRateLimiter,
  loginRateLimiter,
  sensitiveAuthRateLimiter,
} from '../middleware/rateLimit.js';

const router = express.Router();

router.use(authRateLimiter);

router.post('/signup', sensitiveAuthRateLimiter, asyncHandler(signup));
router.post('/login', loginRateLimiter, asyncHandler(login));
router.get('/verify-email/:token', asyncHandler(verifyEmail));
router.post('/resend-verification', sensitiveAuthRateLimiter, asyncHandler(resendVerification));
router.post('/forgot-password', sensitiveAuthRateLimiter, asyncHandler(forgotPassword));
router.post('/reset-password/:token', sensitiveAuthRateLimiter, asyncHandler(resetPassword));
router.post('/refresh', loginRateLimiter, asyncHandler(refreshAccessToken));

// Multi-device session management (requires JWT)
router.get('/sessions', requireAuth, asyncHandler(listSessions));
router.delete('/sessions/:id', requireAuth, asyncHandler(logoutSession));
router.delete('/sessions', requireAuth, asyncHandler(logoutAllSessions));
router.post('/logout', requireAuth, asyncHandler(logoutCurrent));

// Account settings
router.get('/me', requireAuth, asyncHandler(getAccount));
router.patch('/password', requireAuth, sensitiveAuthRateLimiter, asyncHandler(changePassword));
router.patch('/email', requireAuth, sensitiveAuthRateLimiter, asyncHandler(changeEmail));
router.post(
  '/resend-verification-me',
  requireAuth,
  sensitiveAuthRateLimiter,
  asyncHandler(resendMyVerification),
);
router.get('/activity', requireAuth, asyncHandler(getSecurityActivity));
router.get('/export', requireAuth, asyncHandler(exportAccountData));
router.delete('/account', requireAuth, sensitiveAuthRateLimiter, asyncHandler(deleteAccount));

export default router;
