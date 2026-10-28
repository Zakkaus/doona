import type {ComponentProps} from 'react';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Crossfade} from './motion';

export function StatusLabel({label, variant, loading}: {label: string; variant: ComponentProps<typeof StatusDot>['variant']; loading?: boolean}) {
  return (
    <Crossfade swapKey={label} inline>
      <HStack gap={2} vAlign="center" wrap="nowrap" className={loading ? 'lite-loading-control' : undefined}>
        <StatusDot variant={variant} label={label} />
        <Text textWrap="wrap" aria-hidden>
          {label}
        </Text>
        {loading && <Skeleton className="lite-loading-shape" style={{borderRadius: 'var(--radius-full)'}} />}
      </HStack>
    </Crossfade>
  );
}
