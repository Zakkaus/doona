// G6: design values come from tokens. Colours live only in custom properties, so palettes.css owns them.
const colour = '/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|lab|lch)\\(/';

export default {
  rules: {
    'declaration-property-value-disallowed-list': [
      {
        '/^(?!--|mask).*/': [colour], // masks are alpha-only, so their colours carry no hue
        'font-size': ['/\\b\\d+(\\.\\d+)?px\\b/'],
        '/^border(-[a-z]+)*-radius$/': ['/\\b([6-9]|[1-9]\\d+)px\\b/'], // the 6px+ scale is tokenised; 1-4px mark radii are not
        '/^(animation|transition)(-duration|-delay)?$/': ['/(^|[^.\\d])[1-9]\\d*(\\.\\d+)?m?s\\b/'] // 0ms and reduced motion's 0.01ms pass
      },
      {message: 'Use a token from palettes.css or motion.css.'}
    ],
    'selector-pseudo-class-disallowed-list': [['hover'], {message: 'Use [data-hovered], or guard with @media (hover: hover).'}]
  },
  overrides: [{files: ['src/ui/styles/palettes.css'], rules: {'declaration-property-value-disallowed-list': null}}]
};
