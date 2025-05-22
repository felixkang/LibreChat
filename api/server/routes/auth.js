const express = require('express');
const passport = require('passport');
const { wecomLogin } = require('~/strategies');
const { socialLoginCallback } = require('~/server/controllers/auth/socialLoginController'); // Assuming this file and function exist
const {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
} = require('~/server/controllers/AuthController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const {
  enable2FA,
  verify2FA,
  disable2FA,
  regenerateBackupCodes,
  confirm2FA,
} = require('~/server/controllers/TwoFactorController');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  requireJwtAuth,
  checkInviteUser,
  registerLimiter,
  requireLdapAuth,
  setBalanceConfig,
  requireLocalAuth,
  resetPasswordLimiter,
  validateRegistration,
  validatePasswordReset,
} = require('~/server/middleware');

const router = express.Router();

// Initialize WeCom Strategy
if (process.env.WECOM_CORP_ID && process.env.WECOM_AGENT_ID && process.env.WECOM_SECRET) {
  passport.use(
    'wecom',
    wecomLogin({
      CorpID: process.env.WECOM_CORP_ID,
      AgentID: process.env.WECOM_AGENT_ID,
      Secret: process.env.WECOM_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.WECOM_CALLBACK_URL || '/oauth/wecom/callback'}`,
    }),
  );
}

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post(
  '/login',
  logHeaders,
  loginLimiter,
  checkBan,
  ldapAuth ? requireLdapAuth : requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post(
  '/register',
  registerLimiter,
  checkBan,
  checkInviteUser,
  validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  resetPasswordLimiter,
  checkBan,
  validatePasswordReset,
  resetPasswordRequestController,
);
router.post('/resetPassword', checkBan, validatePasswordReset, resetPasswordController);

router.get('/2fa/enable', requireJwtAuth, enable2FA);
router.post('/2fa/verify', requireJwtAuth, verify2FA);
router.post('/2fa/verify-temp', checkBan, verify2FAWithTempToken);
router.post('/2fa/confirm', requireJwtAuth, confirm2FA);
router.post('/2fa/disable', requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', requireJwtAuth, regenerateBackupCodes);

// WeCom authentication routes
if (process.env.WECOM_CORP_ID && process.env.WECOM_AGENT_ID && process.env.WECOM_SECRET) {
  router.get(
    '/oauth/wecom',
    passport.authenticate('wecom', {
      scope: ['snsapi_base'], // Adjust scope as needed for WeCom
      session: false,
    }),
  );

  router.get(
    '/oauth/wecom/callback',
    passport.authenticate('wecom', {
      failureRedirect: `${process.env.DOMAIN_CLIENT}/login?error=wecom_login_failed`, // Or a more specific error page
      session: false,
    }),
    socialLoginCallback, // This function will handle token generation and redirection
  );
}

module.exports = router;
