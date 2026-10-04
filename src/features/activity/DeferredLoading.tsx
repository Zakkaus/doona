import {useContext, type ComponentProps} from 'react';
import {ResourcePreview} from '../../store/preview';
import {SkeletonBar, SkeletonBody, SkeletonGroup} from '../../ui/ui';
// A card's first load: its body's Skeleton, or a dash in a preview, which reads nothing.
export function DeferredLoading({shape = 'rows', count = 1, ...props}: Partial<ComponentProps<typeof SkeletonBody>>) {
  return useContext(ResourcePreview) ? <span aria-hidden="true">—</span> : <SkeletonBody shape={shape} count={count} {...props} />;
}
// A chart's first load as Skeleton bars in the loaded body's own lines and heights, in the card's own gap.
export function DeferredChart({parts}: {parts: Array<{line: 'body' | 'caption'} | {height: number}>}) {
  return useContext(ResourcePreview) ? (
    <span aria-hidden="true">—</span>
  ) : (
    <SkeletonGroup>
      {parts.map((part, i) => ('line' in part ? <SkeletonBar key={i} line={part.line} /> : <SkeletonBar key={i} height={part.height} />))}
    </SkeletonGroup>
  );
}
