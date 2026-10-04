import type {ReactNode} from 'react';
import {FileTrigger} from 'react-aria-components';
import {Button} from './Button';

// S2 has no file control of its own: React Aria's FileTrigger opens the browser's file picker from a kit Button.
export function FileButton({
  acceptedFileTypes,
  onSelect,
  isPending,
  children
}: {
  acceptedFileTypes: string[];
  onSelect: (files: FileList | null) => void;
  isPending?: boolean;
  children: ReactNode;
}) {
  return (
    <FileTrigger acceptedFileTypes={acceptedFileTypes} onSelect={onSelect}>
      <Button isPending={isPending}>{children}</Button>
    </FileTrigger>
  );
}
