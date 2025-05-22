const passport = require('passport');
const axios = require('axios');
const { updateUser, findUserByLogin, createUser } = require('~/models/User');
const { processLogin } = require('./process');
const wechatWorkStrategySetup = require('./wechatWorkStrategy');
const { logger } = require('~/config');

// Mock dependencies
jest.mock('axios');
jest.mock('~/models/User');
jest.mock('./process');
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('passport', () => ({
  use: jest.fn(),
  authenticate: jest.fn().mockImplementation(() => (req, res, next) => next()), // Mock implementation
}));

// Mock environment variables
const mockEnv = {
  WECHATWORK_CORPID: 'test_corpid',
  WECHATWORK_AGENTID: 'test_agentid',
  WECHATWORK_SECRET: 'test_secret',
  WECHATWORK_CALLBACK_URL: '/auth/wechatwork/callback',
  WECHATWORK_SCOPE: 'snsapi_base',
  DOMAIN_SERVER: 'http://localhost:3080',
  SESSION_SECRET: 'test_session_secret', // Needed by passport typically
};

describe('WeChatWork Strategy', () => {
  let originalEnv;
  let strategyInstance; // Will hold the callback function for OAuth2Strategy

  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env = { ...process.env, ...mockEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // This setup function registers the strategy with passport.
    // We need to capture the strategy instance or its verify callback.
    // The `passport.use` mock will be called with the strategy.
    // We'll extract the verify function from the strategy passed to passport.use
    wechatWorkStrategySetup({}); // Call the setup function
    
    // The actual strategy instance is the second argument to passport.use
    // The first argument is the name ('wechatwork')
    if (passport.use.mock.calls.length > 0) {
        const lastCall = passport.use.mock.calls[passport.use.mock.calls.length - 1];
        const actualStrategy = lastCall[1]; // The OAuth2Strategy instance
        strategyInstance = actualStrategy._verify; // The verify callback
    } else {
        throw new Error('Passport strategy was not registered or mock failed');
    }
  });
  
  describe('App Access Token', () => {
    // Note: getAppAccessToken is an internal function.
    // We test its behavior indirectly via the strategy's main callback logic.
    // Or, if we could export it for testing (not current design).
    // For now, we'll mock axios responses that getAppAccessToken would use.

    it('should fetch app access token if not cached', async () => {
      axios.get.mockResolvedValueOnce({ // For getAppAccessToken
        data: { access_token: 'mock_app_token', expires_in: 7200 },
      });
      axios.get.mockResolvedValueOnce({ // For getUserInfo
        data: { UserId: 'testUser' },
      });

      const req = { query: { code: 'auth_code' } };
      const done = jest.fn();

      await strategyInstance(req, 'unused_access_token', 'unused_refresh_token', {}, {}, done);
      
      expect(axios.get).toHaveBeenCalledWith(
        'https://qyapi.weixin.qq.com/cgi-bin/gettoken',
        expect.objectContaining({
          params: { corpid: mockEnv.WECHATWORK_CORPID, corpsecret: mockEnv.WECHATWORK_SECRET },
        }),
      );
      expect(done).toHaveBeenCalledWith(null, expect.any(Object)); // processLogin is mocked
    });

    it('should use cached app access token if valid', async () => {
      // First call to prime the cache
      axios.get.mockResolvedValueOnce({ 
        data: { access_token: 'cached_app_token', expires_in: 7200 },
      });
      axios.get.mockResolvedValueOnce({ 
        data: { UserId: 'testUser1' },
      });
      const req1 = { query: { code: 'auth_code1' } };
      const done1 = jest.fn();
      await strategyInstance(req1, null, null, {}, {}, done1);

      // Second call, should use cache
      axios.get.mockResolvedValueOnce({ // This is for getUserInfo only now
        data: { UserId: 'testUser2' },
      });
      const req2 = { query: { code: 'auth_code2' } };
      const done2 = jest.fn();
      await strategyInstance(req2, null, null, {}, {}, done2);

      // gettoken should only be called once for the first request
      expect(axios.get).toHaveBeenCalledTimes(3); // 1 for token, 2 for userinfo
      expect(axios.get.mock.calls[0][0]).toBe('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
      expect(axios.get.mock.calls[1][0]).toBe('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo');
      expect(axios.get.mock.calls[2][0]).toBe('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo');
      expect(done1).toHaveBeenCalled();
      expect(done2).toHaveBeenCalled();
    });


    it('should handle error when fetching app access token', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error')); // For getAppAccessToken
      const req = { query: { code: 'auth_code' } };
      const done = jest.fn();

      await strategyInstance(req, null, null, {}, {}, done);
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ message: 'Network error' }));
    });
  });

  describe('Authorization URL', () => {
    // The strategy setup returns an object with authenticate and callback methods.
    // The authenticate method internally calls passport.authenticate.
    // We can check if passport.authenticate is called with the correct strategy name.
    const returnedFunctions = wechatWorkStrategySetup({});
    
    it('should attempt to authenticate with "wechatwork" strategy', () => {
      const req = { query: {} };
      const res = { redirect: jest.fn() }; // Mock res.redirect
      const next = jest.fn();
      
      // Temporarily override the mock implementation for this specific test
      const mockPassportAuthenticate = jest.fn().mockImplementation(() => (req, res, next) => { 
        // Simulate passport calling the strategy's logic which might call res.redirect
        // For this test, we just want to see if passport.authenticate('wechatwork') is called
      });
      const originalPassportAuth = passport.authenticate;
      passport.authenticate = mockPassportAuthenticate;

      returnedFunctions.authenticate(req, res, next);
      
      expect(mockPassportAuthenticate).toHaveBeenCalledWith('wechatwork', expect.any(Object));
      passport.authenticate = originalPassportAuth; // Restore original mock
    });

    // userAuthorizationParams is part of the OAuth2Strategy instance, not directly on our setup function's return.
    // To test userAuthorizationParams, we'd need to access the strategy instance passport.use received.
    it('should have correct userAuthorizationParams', () => {
        const strategyUsedByPassport = passport.use.mock.calls[passport.use.mock.calls.length - 1][1];
        const params = strategyUsedByPassport.userAuthorizationParams({ state: 'test_state' });
        expect(params.appid).toBe(mockEnv.WECHATWORK_CORPID);
        expect(params.agentid).toBe(mockEnv.WECHATWORK_AGENTID);
        expect(params.redirect_uri).toBe(mockEnv.DOMAIN_SERVER + mockEnv.WECHATWORK_CALLBACK_URL);
        expect(params.scope).toBe(mockEnv.WECHATWORK_SCOPE);
        expect(params.state).toBe('test_state');
        expect(params.response_type).toBe('code');
    });
  });

  describe('OAuth Callback Handling', () => {
    beforeEach(() => {
      // Mock getAppAccessToken to return a valid token by default for these tests
      axios.get.mockImplementation((url) => {
        if (url === 'https://qyapi.weixin.qq.com/cgi-bin/gettoken') {
          return Promise.resolve({ data: { access_token: 'mock_app_token', expires_in: 7200 } });
        }
        if (url === 'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo') {
          // Default mock for userinfo, specific tests can override
          return Promise.resolve({ data: { UserId: 'defaultUser' } });
        }
        return Promise.reject(new Error(`Unhandled GET request to ${url}`));
      });
      processLogin.mockImplementation(({ req, socialUser, strategyName, done }) => {
        // Simulate processLogin calling done with the user
        done(null, socialUser); 
      });
    });

    it('should handle successful login for a new user', async () => {
      axios.get.mockResolvedValueOnce({ // getAppAccessToken
        data: { access_token: 'mock_app_token', expires_in: 7200 },
      });
      axios.get.mockResolvedValueOnce({ // getUserInfo
        data: { UserId: 'newUser123', DeviceId: 'deviceTest' },
      });
      findUserByLogin.mockResolvedValue(null); // No existing user

      const req = { query: { code: 'valid_auth_code' }, session: {} };
      const done = jest.fn();

      await strategyInstance(req, null, null, {}, {}, done);

      expect(axios.get).toHaveBeenCalledWith(
        'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo',
        expect.objectContaining({
          params: { access_token: 'mock_app_token', code: 'valid_auth_code' },
        }),
      );
      expect(findUserByLogin).toHaveBeenCalledWith('newUser123');
      expect(processLogin).toHaveBeenCalledWith(expect.objectContaining({
        socialUser: expect.objectContaining({
          id: 'newUser123',
          provider: 'wechatwork',
        }),
        strategyName: 'WeChatWork',
        done: expect.any(Function),
      }));
      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ id: 'newUser123' }));
    });

    it('should handle successful login for an existing user', async () => {
      const existingUser = { id: 'existingUser', wechatWorkId: 'existingUser123', name: 'Existing User', username: 'existingUser123', email: null };
      axios.get.mockResolvedValueOnce({ data: { access_token: 'mock_app_token', expires_in: 7200 } }); // token
      axios.get.mockResolvedValueOnce({ data: { UserId: 'existingUser123' } }); // userinfo
      findUserByLogin.mockResolvedValue(existingUser);

      const req = { query: { code: 'valid_auth_code' }, session: {} };
      const done = jest.fn();

      await strategyInstance(req, null, null, {}, {}, done);

      expect(findUserByLogin).toHaveBeenCalledWith('existingUser123');
      expect(processLogin).toHaveBeenCalledWith(expect.objectContaining({
        socialUser: expect.objectContaining({ id: 'existingUser123' }),
        strategyName: 'WeChatWork',
      }));
      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ id: 'existingUser123' }));
    });

    it('should handle error if no code is provided in callback', async () => {
      const req = { query: {} }; // No code
      const done = jest.fn();
      await strategyInstance(req, null, null, {}, {}, done);
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ message: 'No code received from WeChat Work' }));
    });

    it('should handle error from getuserinfo API', async () => {
      axios.get.mockResolvedValueOnce({ data: { access_token: 'mock_app_token', expires_in: 7200 } }); // token
      axios.get.mockResolvedValueOnce({ data: { errcode: 1, errmsg: 'UserInfo Error' } }); // userinfo error

      const req = { query: { code: 'auth_code' } };
      const done = jest.fn();
      await strategyInstance(req, null, null, {}, {}, done);
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to fetch user info from WeChat Work: UserInfo Error' }));
    });

    it('should handle error if no UserId or OpenId in user info', async () => {
      axios.get.mockResolvedValueOnce({ data: { access_token: 'mock_app_token', expires_in: 7200 } }); // token
      axios.get.mockResolvedValueOnce({ data: { errmsg: 'No user identifier' } }); // userinfo missing UserId/OpenId

      const req = { query: { code: 'auth_code' } };
      const done = jest.fn();
      await strategyInstance(req, null, null, {}, {}, done);
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ message: 'No UserId or OpenId received from WeChat Work' }));
    });
  });
});
