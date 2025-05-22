// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  setBalanceConfig,
  checkDomainAllowed,
} = require('~/server/middleware');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(logHeaders);
router.use(loginLimiter);

const oauthHandler = async (req, res) => {
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    await setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
  }
};

router.get('/error', (req, res) => {
  // A single error message is pushed by passport when authentication fails.
  logger.error('Error in OAuth authentication:', { message: req.session.messages.pop() });

  // Redirect to login page with auth_failed parameter to prevent infinite redirect loops
  res.redirect(`${domains.client}/login?redirect=false`);
});

/**
 * Google Routes
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Facebook Routes
 */
router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * OpenID Routes
 */
router.get(
  '/openid',
  passport.authenticate('openid', {
    session: false,
  }),
);

router.get(
  '/openid/callback',
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * GitHub Routes
 */
router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Discord Routes
 */
router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Apple Routes
 */
router.get(
  '/apple',
  passport.authenticate('apple', {
    session: false,
  }),
);

router.post(
  '/apple/callback',
  passport.authenticate('apple', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * WeChat Work Routes
 */
if (process.env.WECHATWORK_CORPID && process.env.WECHATWORK_AGENTID && process.env.WECHATWORK_SECRET && process.env.WECHATWORK_CALLBACK_URL) {
  const wechatWorkScope = process.env.WECHATWORK_SCOPE ? process.env.WECHATWORK_SCOPE.split(',') : ['snsapi_base']; // Default to snsapi_base if not set

  router.get(
    // The login path should be distinct, e.g., /oauth/wechatwork, to match conventions if any.
    // Or, if strategies/index.js defines strategyItem.routes.login, use that.
    // For now, using a simple path, assuming it will be linked correctly from the client.
    // The strategy file itself defines its callbackURL but not necessarily the initial login trigger path.
    // Let's make it consistent with others: /oauth/wechatwork
    '/wechatwork', // Consistent with /google, /github etc.
    passport.authenticate('wechatwork', {
      scope: wechatWorkScope,
      session: false,
      // state: 'YOUR_STATE_VALUE', // Optional: If you need to pass a specific state
      // agentid: process.env.WECHATWORK_AGENTID, // agentid is part of the authorizationURL in strategy
    }),
  );

  router.get(
    // The callback URL path MUST match exactly what's configured in WECHATWORK_CALLBACK_URL
    // and what WeChat Work redirects to.
    // Example: if WECHATWORK_CALLBACK_URL is '/auth/wechatwork/callback', this must be the same.
    // We assume WECHATWORK_CALLBACK_URL is the path part, e.g., /oauth/wechatwork/callback
    new URL(process.env.DOMAIN_SERVER + process.env.WECHATWORK_CALLBACK_URL).pathname,
    passport.authenticate('wechatwork', {
      failureRedirect: `${domains.client}/oauth/error`, // Consistent failure redirect
      failureMessage: true,
      session: false,
    }),
    setBalanceConfig, // Consistent with other oauth routes
    oauthHandler,     // Use the common handler for success
  );
  logger.info('[WeChatWork] WeChat Work OAuth routes configured.');
} else {
  logger.info('[WeChatWork] WeChat Work OAuth routes not configured due to missing environment variables.');
}

module.exports = router;
