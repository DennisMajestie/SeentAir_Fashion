// Karma config for the storefront.
//
// Same reasoning as the admin dashboard's config: plain ChromeHeadless crashed
// on connect (ping timeout) without --no-sandbox on this machine, and the
// default 30s no-activity window is too tight while the big styles bundle is
// parsed. Frameworks, reporters and the jasmine integration are supplied by
// the @angular/build:karma builder itself, so only the launcher is configured.
//
// No --window-size override: the shell specs decide mobile vs desktop in
// TypeScript from the viewport, and headless Chrome's ~800px default keeps the
// desktop branch off exactly as they were written for.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher')],
    reporters: ['dots'],
    client: {
      jasmine: {},
      clearContext: false,
    },
    customLaunchers: {
      ChromeHeadlessSafe: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      },
    },
    browsers: ['ChromeHeadlessSafe'],
    browserDisconnectTimeout: 30000,
    browserNoActivityTimeout: 90000,
    restartOnFileChange: true,
  });
};
