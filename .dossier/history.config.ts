import config from '../.tim23/playwright.config';

export default {
  ...config,
  use: {
    ...config.use,
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
  },
};
