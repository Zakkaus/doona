import {HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import type {ReactNode} from 'react';
import {RefreshProgress} from '../ui';
import {usePageMotion} from './usePageMotion';

// Astryx table-inbox: inset 4, controls 3; settings: section bodies and sections 4.
export const pageRhythm = {inset: 4, headerToToolbar: 6, toolbarToCollection: 4, section: 4, controls: 3} as const;

export function PageFrame({
  title,
  description,
  actions,
  ready,
  refreshing,
  toolbar,
  content,
  footer,
  end
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  ready: boolean;
  refreshing?: boolean;
  toolbar?: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  end?: ReactNode;
}) {
  const motion = usePageMotion(ready);
  return (
    <Layout
      height="fill"
      padding={0}
      header={
        <LayoutHeader ref={motion.header} padding={0} data-page-header>
          <VStack padding={pageRhythm.inset} paddingBlockEnd={0} gap={1}>
            <HStack gap={pageRhythm.controls} vAlign="center" wrap="wrap" minHeight="var(--size-element-md)">
              <StackItem size="fill">
                <Heading level={1} tabIndex={-1}>
                  {title}
                </Heading>
              </StackItem>
              {actions && (
                <HStack gap={2} wrap="wrap" vAlign="center" style={{width: 'auto'}}>
                  {actions}
                </HStack>
              )}
            </HStack>
            <Text type="supporting" color="secondary">
              {description}
            </Text>
          </VStack>
          <RefreshProgress active={!!refreshing} />
        </LayoutHeader>
      }
      content={
        <LayoutContent
          className="lite-page-content"
          padding={pageRhythm.inset}
          style={{contain: 'size layout style', scrollbarGutter: 'stable', paddingBlockStart: `var(--spacing-${pageRhythm.headerToToolbar})`}}
          label={title}
        >
          <VStack ref={motion.body} gap={pageRhythm.toolbarToCollection} className="lite-table-inset" data-page-frame>
            {toolbar}
            {content}
          </VStack>
        </LayoutContent>
      }
      footer={footer}
      end={end}
    />
  );
}
