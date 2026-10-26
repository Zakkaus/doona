import {VStack} from '@astryxdesign/core/VStack';
import type {ReactNode} from 'react';

// CollectionLoading owns the data-arrival fade; list changes stay instant.
export function RowEntrance({children}: {children: ReactNode}) {
  return <VStack style={{display: 'contents'}}>{children}</VStack>;
}
