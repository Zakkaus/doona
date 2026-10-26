import * as stylex from '@stylexjs/stylex';

export const editorLayout = stylex.create({
  members: {
    display: 'grid',
    gridTemplateColumns: {default: 'minmax(0, 1fr)', '@media (min-width: 768px)': 'repeat(2, minmax(0, 1fr))'},
    gap: 'var(--spacing-4)'
  },
  modes: {
    display: 'grid',
    gridTemplateColumns: {default: 'minmax(0, 1fr)', '@media (min-width: 768px)': 'repeat(3, minmax(0, 1fr))'},
    gap: 'var(--spacing-4)',
    width: '100%'
  }
});
