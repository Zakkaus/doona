import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Text, type TextProps} from '@astryxdesign/core/Text';
import type {ReactNode} from 'react';

export function LoadingText({loading, className, children, type, ...props}: TextProps & {loading?: boolean}) {
  return (
    <Text {...props} type={type} className={loading ? `lite-loading-text ${className ?? ''}` : className}>
      {children}
      {loading && <Skeleton className="lite-loading-shape" width={type === 'supporting' ? 'min(12ch, 100%)' : 'min(16ch, 100%)'} />}
    </Text>
  );
}

type LoadingSlot = 'icon' | 'endContent' | 'label' | 'children';
export function loadingControl<S extends LoadingSlot>(loading: boolean | undefined, slot: S, content?: ReactNode, className = '') {
  const shape = loading && <Skeleton className="lite-loading-shape" style={slot === 'label' ? {borderRadius: 'var(--radius-full)'} : undefined} />;
  // Link has both an inline outer box and a block label; preserve both silhouettes.
  if (loading && slot === 'children')
    content = (
      <Text type="inherit" display="block" className="lite-loading-text">
        {content}
        {shape}
      </Text>
    );
  return {
    className: loading ? `${slot === 'children' ? 'lite-loading-text' : 'lite-loading-control'} ${className}` : className,
    [slot]: loading ? (
      <>
        {content}
        {shape}
      </>
    ) : (
      content
    )
  } as {className: string} & Record<S, ReactNode>;
}
