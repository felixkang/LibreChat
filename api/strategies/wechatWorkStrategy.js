const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios'); // For making HTTP requests
const { logger } = require('~/config');
const { createUser, findUserByLogin, updateUser } = require('~/models/User'); // Assuming these functions exist
const { processLogin } = require('./process'); // Assuming this function handles common login processing

// Environment variables
const WECHATWORK_CORPID = process.env.WECHATWORK_CORPID;
const WECHATWORK_AGENTID = process.env.WECHATWORK_AGENTID;
const WECHATWORK_SECRET = process.env.WECHATWORK_SECRET;
const WECHATWORK_CALLBACK_URL = process.env.WECHATWORK_CALLBACK_URL;
const WECHATWORK_SCOPE = process.env.WECHATWORK_SCOPE || 'snsapi_base'; // Default scope
const DOMAIN_SERVER = process.env.DOMAIN_SERVER;

// WeChat Work URLs
const WECHATWORK_AUTHORIZATION_URL = 'https://open.work.weixin.qq.com/wwopen/sso/qrConnect';
const WECHATWORK_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken';
const WECHATWORK_USERINFO_URL = 'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo';

// Cache for app-level access token
let appAccessToken = null;
let appAccessTokenExpiry = null;

// Function to get (and refresh if necessary) the app-level access token
async function getAppAccessToken() {
  if (appAccessToken && appAccessTokenExpiry && Date.now() < appAccessTokenExpiry) {
    return appAccessToken;
  }

  try {
    const response = await axios.get(WECHATWORK_TOKEN_URL, {
      params: {
        corpid: WECHATWORK_CORPID,
        corpsecret: WECHATWORK_SECRET,
      },
    });

    if (response.data && response.data.access_token) {
      appAccessToken = response.data.access_token;
      // WeChat Work token expires in 7200 seconds (2 hours)
      // Set expiry to a bit earlier to be safe (e.g., 7000 seconds)
      appAccessTokenExpiry = Date.now() + (response.data.expires_in - 200) * 1000;
      logger.info('[WeChatWorkStrategy] App access token obtained successfully.');
      return appAccessToken;
    } else {
      logger.error('[WeChatWorkStrategy] Failed to obtain app access token:', response.data);
      throw new Error('Failed to obtain WeChat Work app access token');
    }
  } catch (error) {
    logger.error('[WeChatWorkStrategy] Error obtaining app access token:', error.message);
    throw error;
  }
}

module.exports = function (config) {
  const strategy = new OAuth2Strategy(
    {
      authorizationURL: WECHATWORK_AUTHORIZATION_URL,
      tokenURL: WECHATWORK_TOKEN_URL, // This is for the app token, user info is separate
      clientID: WECHATWORK_CORPID, // In WeChat Work, CorpID is like clientID
      clientSecret: WECHATWORK_SECRET, // CorpSecret
      callbackURL: DOMAIN_SERVER + WECHATWORK_CALLBACK_URL,
      scope: WECHATWORK_SCOPE,
      agentid: WECHATWORK_AGENTID, // Specific to WeChat Work
      passReqToCallback: true, // To access the request object in the callback
    },
    async (req, accessToken, refreshToken, params, profile, done) => {
      // Note: accessToken and refreshToken from passport-oauth2 are not directly used here.
      // We use the 'code' from the callback to get user info with our appAccessToken.
      const code = req.query.code;

      if (!code) {
        logger.error('[WeChatWorkStrategy] No code received in callback.');
        return done(new Error('No code received from WeChat Work'));
      }

      try {
        const appToken = await getAppAccessToken();
        const userInfoResponse = await axios.get(WECHATWORK_USERINFO_URL, {
          params: {
            access_token: appToken,
            code: code,
          },
        });

        logger.debug('[WeChatWorkStrategy] User info response:', userInfoResponse.data);

        if (userInfoResponse.data.errcode && userInfoResponse.data.errcode !== 0) {
          logger.error(
            '[WeChatWorkStrategy] Error fetching user info:',
            userInfoResponse.data.errmsg,
          );
          return done(
            new Error(
              `Failed to fetch user info from WeChat Work: ${userInfoResponse.data.errmsg}`,
            ),
          );
        }

        const userId = userInfoResponse.data.UserId || userInfoResponse.data.OpenId;
        const deviceId = userInfoResponse.data.DeviceId; // May or may not be present

        if (!userId) {
          logger.error(
            '[WeChatWorkStrategy] No UserId or OpenId found in user info response.',
            userInfoResponse.data,
          );
          return done(new Error('No UserId or OpenId received from WeChat Work'));
        }

        // Construct user profile (basic)
        const userProfile = {
          id: userId,
          login: userId, // Use userId as login
          username: userId, // Default username to userId
          displayName: userId, // Default displayName to userId
          provider: 'wechatwork',
          email: null, // WeChat Work doesn't typically provide email directly in this flow
        };
        
        // If scope was snsapi_userinfo, we might have more details, but that's a separate call usually.
        // For now, we'll proceed with UserId/OpenId.

        // Process login (find or create user)
        // This part needs to align with how `socialLogin.js` and `process.js` handle users.
        // Assuming `processLogin` can handle this or we need a similar function.

        let user = await findUserByLogin(userId);

        if (!user) {
          const newUser = {
            username: userId,
            email: null, // Or generate a placeholder e.g., `${userId}@wechatwork.local`
            wechatWorkId: userId, // Store WeChat Work specific ID
            name: userId, // Default name
            avatar: '', // Placeholder for avatar
            // Add other necessary fields
          };
          // The actual creation logic might be more complex, involving `socialLogin.js` patterns
          // For now, a direct creation for simplicity in this step.
          // user = await createUser(newUser);

          // Let's use a structure similar to other strategies, which might involve `req.session`
          // and a more generic user creation/linking process.
          // For now, we will simulate the user object creation as it would be after DB interaction.
          
          // This is a simplified user creation path.
          // In a real scenario, you'd use a robust function like `createUser` from your models
          // and potentially link it to `socialLogin.js` logic.

          const {
            name,
            email, // Assuming email might not be available or needs a placeholder
            username,
            avatar,
            provider,
          } = userProfile;

          // This part needs to be adapted from `socialLogin.js`
          // For now, creating a basic user structure for the `done` callback.
          const emailProvided = false; // WeChat Work doesn't give email in this flow
          const socialUser = {
            id: userId,
            name: name || userId,
            username: username || userId,
            email: email, // Will be null or placeholder
            emailProvided: emailProvided,
            avatar: avatar || '',
            provider: 'wechatwork',
            accessToken: appToken, // This is app token, not user token. Store carefully.
          };
          
          // Call processLogin, which should handle user creation/retrieval
          return processLogin({
            req,
            socialUser,
            strategyName: 'WeChatWork',
            done,
          });

        } else {
           // User exists, update if necessary (e.g., last login, avatar if available)
           // await updateUser(user._id, { lastLoginAt: new Date() }); // Example update
          
          // Similar to the new user case, use processLogin for existing users
          const socialUser = {
            id: user.wechatWorkId || user.id, // Assuming we store wechatWorkId
            name: user.name || userId,
            username: user.username || userId,
            email: user.email,
            emailProvided: !!user.email,
            avatar: user.avatar || '',
            provider: 'wechatwork',
            accessToken: appToken, 
          };
          return processLogin({
            req,
            socialUser,
            strategyName: 'WeChatWork',
            done,
          });
        }

      } catch (error) {
        logger.error('[WeChatWorkStrategy] Error during authentication:', error);
        return done(error);
      }
    },
  );

  // Customize the authorization URL construction
  strategy.userAuthorizationParams = function (options) {
    return {
      appid: WECHATWORK_CORPID,
      redirect_uri: DOMAIN_SERVER + WECHATWORK_CALLBACK_URL,
      response_type: 'code',
      scope: WECHATWORK_SCOPE,
      agentid: WECHATWORK_AGENTID,
      state: options.state || 'wechatwork_sso_state', // Add state for CSRF protection
      // '#wechat_redirect': '', // This is typically appended at the very end of the URL
    };
  };
  
  // The #wechat_redirect fragment must be appended literally at the end of the URL.
  // passport-oauth2's `authorizationURL` might not handle fragments well by default.
  // We might need to adjust how it's constructed or override a method if necessary.
  // For now, let's assume the default construction + params will be mostly correct,
  // and the client initiating the login will append '#wechat_redirect'.
  // Or, more robustly, override the `authorizationURL` getter in the strategy instance or prototype.

  const originalAuthorizationURL = strategy.authorizationURL;
  strategy.authorizationURL = `${originalAuthorizationURL}?appid=${WECHATWORK_CORPID}&agentid=${WECHATWORK_AGENTID}&redirect_uri=${encodeURIComponent(DOMAIN_SERVER + WECHATWORK_CALLBACK_URL)}&response_type=code&scope=${WECHATWORK_SCOPE}&state=STATE#wechat_redirect`;
  // Note: The 'STATE' here is a placeholder. passport-oauth2 usually handles state generation.
  // We need to ensure the state parameter is correctly inserted by the library.
  // The `userAuthorizationParams` function is the better place to manage query parameters.
  // The fragment `#wechat_redirect` needs to be handled carefully.

  // Let's refine the authorization URL generation.
  // The OAuth2Strategy's `authenticate` method constructs the URL.
  // We need to ensure `#wechat_redirect` is correctly appended.

  // A common way to ensure the fragment is to override the redirect method if passport doesn't handle it,
  // or ensure the client-side call constructs it.
  // For now, the `userAuthorizationParams` should set up all query params correctly.
  // The fragment `#wechat_redirect` is a specific requirement from WeChat.

  passport.use('wechatwork', strategy);

  return {
    authenticate: (req, res, next) => {
      // Custom logic before redirecting if needed
      // For example, ensuring all env variables are set
      if (!WECHATWORK_CORPID || !WECHATWORK_SECRET || !WECHATWORK_AGENTID || !WECHATWORK_CALLBACK_URL || !DOMAIN_SERVER) {
        logger.error('[WeChatWorkStrategy] Missing one or more required environment variables for WeChat Work.');
        // return res.status(500).send('WeChat Work authentication is not configured.');
        // Or redirect to an error page
        return next(new Error('WeChat Work authentication is not configured. Missing environment variables.'));
      }
      
      // The actual redirect URL will be constructed by passport.authenticate,
      // including parameters from `userAuthorizationParams`.
      // We need to make sure the #wechat_redirect is appended.
      // passport-oauth2 doesn't directly support URL fragments in authorizationURL.
      // One way is to modify the location provided by passport's redirect.

      const { redirect } = res;
      res.redirect = (url) => {
        if (url.startsWith(WECHATWORK_AUTHORIZATION_URL)) {
          // Ensure state is properly included if generated by passport
          const stateParam = url.includes('state=') ? '' : `&state=${req.query.state || 'defaultState'}`; // crude state handling if not present
          const finalUrl = `${url.split('#')[0]}${stateParam}#wechat_redirect`;
          logger.debug(`[WeChatWorkStrategy] Redirecting to: ${finalUrl}`);
          redirect.call(res, finalUrl);
        } else {
          redirect.call(res, url);
        }
      };

      passport.authenticate('wechatwork', {
        scope: WECHATWORK_SCOPE,
        // state: 'your_state_value' // Can be set here or dynamically
      })(req, res, next);
    },
    callback: (req, res, next) => {
      passport.authenticate('wechatwork', {
        // successRedirect: '/', // Handled by processLogin
        // failureRedirect: '/login', // Handled by processLogin or error handler
        session: false, // Typically, session is handled after successful auth by the main app
      }, (err, user, info) => {
        if (err) {
          logger.error('[WeChatWorkStrategy] Callback error:', err);
          // Redirect to a login/error page with error message
          // return res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
          return next(err); // Pass to error handler
        }
        if (!user) {
          logger.warn('[WeChatWorkStrategy] Authentication failed, no user returned.', info);
          // return res.redirect(`/login?error=${encodeURIComponent(info && info.message || 'Authentication failed')}`);
           return next(new Error(info && info.message || 'WeChat Work authentication failed.'));
        }
        // `processLogin` should call `req.logIn` and handle redirection.
        // If processLogin calls done(err, user), then this callback handles it.
        // If processLogin handles response directly (e.g. res.redirect), then nothing more here.
        // Assuming processLogin will call req.logIn and then redirect or pass user to next handler.
        req.user = user; // Make user available on request if not already handled by processLogin's req.logIn
        return next(); 

      })(req, res, next);
    },
  };
};

// Example usage (this would be in your main passport setup file)
// const wechatWorkSetup = require('./strategies/wechatWorkStrategy');
// wechatWorkSetup({/* any specific config if needed */});
