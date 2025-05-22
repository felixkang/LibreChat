// This file determines which social logins are enabled based on environment variables.

/**
 * Returns an array of enabled social login provider names.
 * @returns {string[]}
 */
function getSocialLogins() {
  const logins = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    logins.push('google');
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    logins.push('facebook');
  }
  if (process.env.OPENID_CLIENT_ID && process.env.OPENID_CLIENT_SECRET && process.env.OPENID_ISSUER) {
    logins.push('openid');
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    logins.push('github');
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    logins.push('discord');
  }
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
    logins.push('apple');
  }
  // Add WeChat Work
  if (
    process.env.WECHATWORK_CORPID &&
    process.env.WECHATWORK_AGENTID &&
    process.env.WECHATWORK_SECRET &&
    process.env.WECHATWORK_CALLBACK_URL
  ) {
    logins.push('wechatwork');
  }
  return logins;
}

/**
 * Returns an object with boolean flags indicating if each social login is enabled.
 * @returns {object}
 */
function getLoginFlags() {
  return {
    localLoginEnabled: process.env.ALLOW_EMAIL_LOGIN === 'true', // Assuming this is how local login is controlled
    emailLoginEnabled: process.env.ALLOW_EMAIL_LOGIN === 'true', // Duplicate for clarity or specific use
    registrationEnabled: process.env.ALLOW_REGISTRATION === 'true',
    socialLoginEnabled: process.env.ALLOW_SOCIAL_LOGIN === 'true',
    googleLoginEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    facebookLoginEnabled: !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
    openidLoginEnabled: !!(process.env.OPENID_CLIENT_ID && process.env.OPENID_CLIENT_SECRET && process.env.OPENID_ISSUER),
    openidLabel: process.env.OPENID_BUTTON_LABEL || 'OpenID',
    openidImageUrl: process.env.OPENID_IMAGE_URL,
    openidAutoRedirect: process.env.OPENID_AUTO_REDIRECT === 'true',
    githubLoginEnabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    discordLoginEnabled: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    appleLoginEnabled: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_PATH),
    wechatworkLoginEnabled: !!(
      process.env.WECHATWORK_CORPID &&
      process.env.WECHATWORK_AGENTID &&
      process.env.WECHATWORK_SECRET &&
      process.env.WECHATWORK_CALLBACK_URL
    ),
    // Add other general login related flags if any
  };
}

const socialLogins = getSocialLogins();
const loginFlags = getLoginFlags();

// Determine overall socialLoginEnabled based on if any social login is actually configured
const effectiveSocialLoginEnabled = loginFlags.socialLoginEnabled && socialLogins.length > 0;

module.exports = {
  socialLogins, // Array of enabled social login provider names
  ...loginFlags, // Individual boolean flags for each provider
  socialLoginEnabled: effectiveSocialLoginEnabled, // Override socialLoginEnabled based on actual logins
  getSocialLogins, // Exporting the function itself in case it's used elsewhere
  getLoginFlags,   // Exporting the function itself
};
