import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import type {ReactNode} from 'react';
import './disclosure.css';
import {Crossfade} from './motion';
export function DisclosureCard({
  open,
  onOpenChange,
  trigger,
  actions,
  actionsBelow = false,
  metadata,
  summary,
  children,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  actions?: ReactNode;
  actionsBelow?: boolean;
  metadata?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  'data-group-card'?: string;
  'data-provider-id'?: string;
  'aria-busy'?: boolean;
}) {
  return (
    <Card padding={4} {...props}>
      <Grid className={`lite-disclosure-grid${actionsBelow ? ' lite-disclosure-actions-below' : ''}${metadata ? ' lite-disclosure-has-metadata' : ''}`}>
        <Collapsible className="lite-disclosure" isOpen={open} onOpenChange={onOpenChange} chevronPosition="start" trigger={trigger}>
          <VStack gap={4} style={{paddingBlockStart: 'var(--spacing-4)'}}>
            <Crossfade swapKey={String(open)} gap={4}>
              {open && children}
            </Crossfade>
          </VStack>
        </Collapsible>
        <HStack className="lite-disclosure-actions" gap={1} wrap="wrap" vAlign="center">
          {actions}
        </HStack>
        {metadata && (
          <VStack className="lite-disclosure-metadata" style={{paddingBlockStart: 'var(--spacing-2)'}}>
            {metadata}
          </VStack>
        )}
        {!open && summary && (
          <VStack className="lite-disclosure-summary" style={{paddingBlockStart: 'var(--spacing-3)'}}>
            {summary}
          </VStack>
        )}
      </Grid>
    </Card>
  );
}
