/**
 * Stitch design tokens for the Seentair Mobile B2B Platforms screens
 * (project 11876445789761593512), carried verbatim from the Stitch export so
 * the screen markup can be used class-for-class.
 *
 * Two deliberate adaptations for the Angular build:
 *  - Utilities are scoped under the `.stitch` root every screen template
 *    carries, so they cannot leak into `@seentair/ui` components or the
 *    earlier screen work; preflight is disabled and re-applied inside
 *    `.stitch` in src/styles/tailwind.css instead.
 *  - Dark mode follows the ThemeService's `data-theme="dark"` attribute.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/index.html', './src/app/**/*.ts'],
  important: '.stitch',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'accent': '#c88a12',
        'on-accent': '#1a1405',
        'canvas': '#f7f2ea',
        'canvas-tint': '#efe3c8',
        'border': '#e8e1d3',
        'success': '#23804d',
        'on-success': '#ffffff',
        'warning': '#93600a',
        'on-warning': '#ffffff',
        'danger': '#bf3a2d',
        'on-danger': '#ffffff',
        'light-primary': '#1b1916',
        'light-on-primary': '#ffffff',
        'light-secondary': '#7b756a',
        'light-on-secondary': '#ffffff',
        'light-surface': '#fffdf9',
        'light-on-surface': '#1b1916',
        'light-surface-variant': '#f2ece0',
        'light-on-surface-variant': '#706B61',
        'light-outline': '#e8e1d3',
        'dark-primary': '#f7f2ea',
        'dark-on-primary': '#1b1916',
        'dark-secondary': '#aba496',
        'dark-on-secondary': '#1b1916',
        'dark-surface': '#1f1c18',
        'dark-on-surface': '#f7f2ea',
        'dark-surface-variant': '#2b2721',
        'dark-on-surface-variant': '#aba496',
        'dark-outline': '#3d3830',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '12px',
        'md': '14px',
        'lg': '16px',
        'xl': '22px',
        'full': '999px',
      },
      spacing: {
        'gutter-xs': '4px',
        'gutter-sm': '8px',
        'gutter-md': '12px',
        'gutter-lg': '16px',
        'gutter-xl': '20px',
        'gutter-2xl': '24px',
        'section': '32px',
        'page-margin': '16px',
      },
      fontFamily: {
        'display': ['"Urbanist"', 'sans-serif'],
        'headline': ['"Urbanist"', 'sans-serif'],
        'title': ['"Urbanist"', 'sans-serif'],
        'body': ['"Urbanist"', 'sans-serif'],
        'label': ['"Urbanist"', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'display-lg': ['40px', { lineHeight: '48px', letterSpacing: '-0.5px', fontWeight: '700' }],
        'display-lg-mobile': ['28px', { lineHeight: '34px', letterSpacing: '-0.25px', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '38px', letterSpacing: '-0.25px', fontWeight: '700' }],
        'headline-lg-mobile': ['24px', { lineHeight: '30px', letterSpacing: '-0.2px', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '26px', letterSpacing: '-0.15px', fontWeight: '600' }],
        'title-lg': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'label-sm': ['11px', { lineHeight: '14px', fontWeight: '500' }],
      },
      transitionDuration: {
        'state-change': '120ms',
        'surface-enter': '240ms',
        'surface-exit': '160ms',
      },
      transitionDelay: {
        'state-change': '0ms',
        'surface-enter': '0ms',
        'surface-exit': '0ms',
      },
      transitionTimingFunction: {
        'state-change': 'ease-out',
        'surface-enter': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'surface-exit': 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
  plugins: [],
};
