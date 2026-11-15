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
        'accent': 'rgb(var(--sem-accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--sem-on-accent) / <alpha-value>)',
        'canvas': 'rgb(var(--sem-canvas) / <alpha-value>)',
        'canvas-tint': 'rgb(var(--sem-canvas-tint) / <alpha-value>)',
        'border': 'rgb(var(--sem-border) / <alpha-value>)',
        'success': 'rgb(var(--sem-success) / <alpha-value>)',
        'on-success': 'rgb(var(--sem-on-success) / <alpha-value>)',
        'warning': 'rgb(var(--sem-warning) / <alpha-value>)',
        'on-warning': 'rgb(var(--sem-on-warning) / <alpha-value>)',
        'danger': 'rgb(var(--sem-danger) / <alpha-value>)',
        'on-danger': 'rgb(var(--sem-on-danger) / <alpha-value>)',
        'light-primary': 'rgb(var(--sem-primary) / <alpha-value>)',
        'light-on-primary': 'rgb(var(--sem-on-primary) / <alpha-value>)',
        'light-secondary': 'rgb(var(--sem-secondary) / <alpha-value>)',
        'light-on-secondary': 'rgb(var(--sem-on-secondary) / <alpha-value>)',
        'light-surface': 'rgb(var(--sem-surface) / <alpha-value>)',
        'light-on-surface': 'rgb(var(--sem-on-surface) / <alpha-value>)',
        'light-surface-variant': 'rgb(var(--sem-surface-variant) / <alpha-value>)',
        'light-on-surface-variant': 'rgb(var(--sem-on-surface-variant) / <alpha-value>)',
        'light-outline': 'rgb(var(--sem-outline) / <alpha-value>)',
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
