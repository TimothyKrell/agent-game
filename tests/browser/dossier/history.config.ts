import config from '../story-navigation/playwright.config';

export default {
  ...config,
  use: {
    ...config.use,
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
  },
};
