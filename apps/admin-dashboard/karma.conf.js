// Karma config for the admin dashboard.
//
// The ops login has viewport-dependent layout: the photo overlay left-aligns
// its column above 899px and re-centres below it. Headless Chrome's default
// window is ~800px, so the desktop rules were never exercised - which is why
// the old two-column shell specs could pass or fail purely on window size.
// A fixed 1440x900 window makes those assertions deterministic.
//
// Frameworks, reporters and the jasmine integration are supplied by the
// @angular/build:karma builder itself, so only the launcher is configured here.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher')],
    reporters: ['progress'],
    client: {
      jasmine: {},
      clearContext: false,
    },
    customLaunchers: {
      ChromeHeadlessWide: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          // Desktop width, so the >899px overlay rules are the ones under test.
          '--window-size=1440,900',
        ],
      },
    },
    browsers: ['ChromeHeadlessWide'],
    browserDisconnectTimeout: 30000,
    browserNoActivityTimeout: 90000,
    restartOnFileChange: true,
  });
};
