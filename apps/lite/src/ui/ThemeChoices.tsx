// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx settings-dialog template; see ASTRYX-TEMPLATES-LICENSE.

import * as stylex from '@stylexjs/stylex';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {Theme, colorDefaults} from '@astryxdesign/core/theme';
import type {CSSProperties} from 'react';
import {siteTheme} from '../themes/site/site';
import {Grid} from '@astryxdesign/core/Grid';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Text} from '@astryxdesign/core/Text';
import {RowEntrance} from './motion';
import {useMessages} from '../i18n';
import type {Mode} from '../app/preferences';
const preview = stylex.create({
  // One bar of "text". Astryx has no primitive for a content placeholder at
  // this scale — `Skeleton` is the near miss, and it animates.
  bar: {
    height: 'var(--spacing-1)',
    width: '50%',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-border-emphasized)'
  },
  barWide: {
    width: '66%'
  },
  clip: {
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)'
  },
  // The two borderless regions of the miniature. `Theme` re-declares these
  // tokens for the mode it is previewing, so Light stays light in a dark app.
  mutedSurface: {
    backgroundColor: 'var(--color-background-muted)'
  },
  contentSurface: {
    backgroundColor: 'var(--color-background-surface)'
  },
  inert: {
    pointerEvents: 'none'
  }
});

// Core defaults inherit their resolved colour from the outer theme. Rebind the
// three preview tokens inside each nested Theme so its own colour scheme wins.
const previewTokens = {
  '--color-background-surface': colorDefaults['--color-background-surface'],
  '--color-background-muted': colorDefaults['--color-background-muted'],
  '--color-border-emphasized': colorDefaults['--color-border-emphasized']
} as CSSProperties;

function ThemePreviewCanvas({mode}: {mode: 'light' | 'dark'}) {
  const canvas = (
    // No Cards here. A Card's default variant owns a border, and nesting one
    // inside a selected SelectableCard produced three competing outlines: the
    // selection ring, a frame around the preview, and another around its body.
    // These are decorative regions, not content containers, so flat token
    // surfaces are the weaker and correct grouping primitive.
    <VStack padding={2} gap={1.5} height="100%" xstyle={preview.mutedSurface} style={previewTokens}>
      <VStack gap={1} align="center">
        <VStack xstyle={[preview.bar, preview.barWide]} />
        <VStack xstyle={preview.bar} />
      </VStack>
      <StackItem size="fill">
        <VStack padding={2} gap={1} justify="center" height="100%" xstyle={preview.contentSurface}>
          {[0, 1, 2].map(row => (
            <VStack key={row} xstyle={preview.bar} />
          ))}
        </VStack>
      </StackItem>
    </VStack>
  );

  return (
    // Use the bundled theme directly rather than discovering the ambient theme
    // through registry hooks. Template previews run against the installed
    // package's runtime surface, which can lag this repository's source types;
    // `Theme` + `siteTheme` is the stable public composition the docsite and
    // generated applications already use.
    <Theme theme={siteTheme} mode={mode}>
      {canvas}
    </Theme>
  );
}

function ThemePreviewMock({scheme}: {scheme: 'light' | 'dark' | 'system'}) {
  return (
    // One AspectRatio path for every option. System splits that same 3:2 frame
    // into two equal regions rather than drawing two full windows on top of one
    // another, so there are no absolute layers and no seams with stray borders.
    <AspectRatio ratio={3 / 2} xstyle={preview.inert}>
      <VStack aria-hidden="true" height="100%" xstyle={preview.clip}>
        {scheme === 'system' ? (
          <HStack gap={0} height="100%">
            <StackItem size="fill">
              <ThemePreviewCanvas mode="light" />
            </StackItem>
            <StackItem size="fill">
              <ThemePreviewCanvas mode="dark" />
            </StackItem>
          </HStack>
        ) : (
          <ThemePreviewCanvas mode={scheme} />
        )}
      </VStack>
    </AspectRatio>
  );
}

export function ThemeChoices({value, onChange}: {value: Mode; onChange: (value: Mode) => void}) {
  const t = useMessages();
  return (
    <RowEntrance>
      <Grid role="radiogroup" aria-label={t.theme} columns={{minWidth: 96, max: 3}} gap={2} maxWidth={480}>
        {(['light', 'dark', 'system'] as const).map(mode => (
          <SelectableCard key={mode} label={t[mode]} isSelected={value === mode} padding={2} onChange={() => onChange(mode)}>
            <VStack gap={1.5}>
              <ThemePreviewMock scheme={mode} />
              <HStack gap={1} align="center" justify="center">
                <Text type="supporting" weight={value === mode ? 'semibold' : undefined}>
                  {t[mode]}
                </Text>
              </HStack>
            </VStack>
          </SelectableCard>
        ))}
      </Grid>
    </RowEntrance>
  );
}
