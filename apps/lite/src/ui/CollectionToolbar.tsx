import {HStack, StackItem} from '@astryxdesign/core/Layout';
import {SizeProvider} from '@astryxdesign/core/SizeContext';
import {Children, isValidElement, type ComponentProps, type ReactNode} from 'react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Search} from './icons';
import {pageRhythm} from './PageFrame';

export function CollectionSearch({width: _width, ...props}: ComponentProps<typeof TextInput>) {
  return (
    <StackItem className="lite-search-field">
      <TextInput {...props} width="100%" size="md" isLabelHidden startIcon={Search} hasClear />
    </StackItem>
  );
}

const searchField = (child: ReactNode) =>
  isValidElement<ComponentProps<typeof TextInput>>(child) && child.type === TextInput ? <CollectionSearch {...child.props} key={child.key} /> : child;

export function CollectionToolbar({start, children}: {start?: ReactNode; children?: ReactNode}) {
  return (
    <SizeProvider value="md">
      <HStack gap={pageRhythm.controls} vAlign="center" wrap="wrap" className="lite-collection-toolbar" data-list-toolbar data-collection-toolbar>
        {start && <StackItem className="lite-toolbar-search">{searchField(start)}</StackItem>}
        {Children.map(children, searchField)}
      </HStack>
    </SizeProvider>
  );
}
