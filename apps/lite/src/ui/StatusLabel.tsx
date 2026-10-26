import type {ComponentProps} from 'react';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Crossfade} from './motion';

export function StatusLabel({label, variant}: {label: string; variant: ComponentProps<typeof StatusDot>['variant']}) {
  return (
    <Crossfade swapKey={label} inline>
      <HStack gap={2} vAlign="center" wrap="nowrap">
        <StatusDot variant={variant} label={label} />
        <Text textWrap="wrap" aria-hidden>
          {label}
        </Text>
      </HStack>
    </Crossfade>
  );
}
