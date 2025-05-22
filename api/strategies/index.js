const { logger } = require('~/config'); // Assuming logger is available

// Import strategy setup functions
const setupApple = require('./appleStrategy');
const setupLocal = require('./localStrategy');
const setupGoogle = require('./googleStrategy');
const setupGitHub = require('./githubStrategy');
const setupDiscord = require('./discordStrategy');
const setupFacebook = require('./facebookStrategy');
const setupOpenId = require('./openidStrategy');
const setupJwt = require('./jwtStrategy');
const setupLdap = require('./ldapStrategy');
const setupWeChatWork = require('./wechatWorkStrategy');

// Strategies that require callback routes and are typically "social logins"
const socialLoginStrategies = [
  {
    name: 'google',
    enabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    strategy: setupGoogle,
    routes: {
      login: '/auth/google',
      callback: '/auth/google/callback',
    },
  },
  {
    name: 'github',
    enabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
    strategy: setupGitHub,
    routes: {
      login: '/auth/github',
      callback: '/auth/github/callback',
    },
  },
  {
    name: 'discord',
    enabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
    strategy: setupDiscord,
    routes: {
      login: '/auth/discord',
      callback: '/auth/discord/callback',
    },
  },
  {
    name: 'facebook',
    enabled: !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
    strategy: setupFacebook,
    routes: {
      login: '/auth/facebook',
      callback: '/auth/facebook/callback',
    },
  },
  {
    name: 'openid',
    enabled:
      !!process.env.OPENID_CLIENT_ID &&
      !!process.env.OPENID_CLIENT_SECRET &&
      !!process.env.OPENID_ISSUER &&
      !!process.env.OPENID_AUTH_URL &&
      !!process.env.OPENID_TOKEN_URL &&
      !!process.env.OPENID_USERINFO_URL &&
      !!process.env.OPENID_CALLBACK_URL,
    strategy: setupOpenId,
    routes: {
      login: '/auth/openid',
      callback: process.env.OPENID_CALLBACK_URL || '/auth/openid/callback',
    },
  },
  {
    name: 'wechatwork',
    enabled: !!process.env.WECHATWORK_CORPID && !!process.env.WECHATWORK_AGENTID && !!process.env.WECHATWORK_SECRET && !!process.env.WECHATWORK_CALLBACK_URL,
    strategy: setupWeChatWork,
    routes: {
      login: '/auth/wechatwork', // Standardized login route
      callback: process.env.WECHATWORK_CALLBACK_URL, // Callback URL from env
    },
  },
];

// Initialize all social login strategies
socialLoginStrategies.forEach((strategyItem) => {
  if (strategyItem.enabled && strategyItem.strategy) {
    try {
      // Pass the routes to the strategy setup, if the setup function expects it
      // This matches the pattern in the original googleStrategy.js which expects a config object
      if (typeof strategyItem.strategy === 'function') {
        strategyItem.strategy({ routes: strategyItem.routes });
        logger.info(`[Strategies] Initialized ${strategyItem.name} strategy.`);
      }
    } catch (error) {
      logger.error(`[Strategies] Failed to initialize ${strategyItem.name} strategy:`, error);
    }
  } else if (strategyItem.strategy) {
    logger.info(
      `[Strategies] ${strategyItem.name} strategy is defined but not enabled (missing environment variables).`,
    );
  }
});

// Initialize other strategies
// These setup functions are called without arguments, assuming they handle their own config internally
if (setupLocal) {
  try {
    setupLocal();
    logger.info('[Strategies] Initialized local strategy.');
  } catch (error) {
    logger.error('[Strategies] Failed to initialize local strategy:', error);
  }
}

if (setupJwt) {
  try {
    setupJwt();
    logger.info('[Strategies] Initialized JWT strategy.');
  } catch (error) {
    logger.error('[Strategies] Failed to initialize JWT strategy:', error);
  }
}

if (process.env.LDAP_URL && setupLdap) {
  try {
    setupLdap();
    logger.info('[Strategies] Initialized LDAP strategy.');
  } catch (error) {
    logger.error('[Strategies] Failed to initialize LDAP strategy:', error);
  }
} else if (setupLdap) {
  logger.info('[Strategies] LDAP strategy is defined but not enabled (missing LDAP_URL).');
}

// Assuming APPLE_CLIENT_ID indicates Apple strategy is enabled
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PRIVATE_KEY && setupApple) {
  try {
    setupApple();
    logger.info('[Strategies] Initialized Apple strategy.');
  } catch (error) {
    logger.error('[Strategies] Failed to initialize Apple strategy:', error);
  }
} else if (setupApple) {
  logger.info('[Strategies] Apple strategy is defined but not enabled (missing environment variables).');
}

module.exports = {
  socialLoginStrategies,
  // Exporting individual setup functions in case they are used elsewhere,
  // though initialization is now handled in this file.
  setupApple,
  setupLocal,
  setupGoogle,
  setupGitHub,
  setupDiscord,
  setupFacebook,
  setupOpenId,
  setupJwt,
  setupLdap,
  setupWeChatWork,
};