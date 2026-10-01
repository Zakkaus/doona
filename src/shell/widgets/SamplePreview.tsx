import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {ResourceSamples} from '../../store/preview';
import {loadSamples, type PreviewSamples} from './samples';
import type {WidgetId} from './layout';
import {hasModulePreviewData} from './preview';

export function SamplePreview({children, id}: {children: ReactNode; id: WidgetId}) {
  const [samples, setSamples] = useState<PreviewSamples>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    let active = true;
    loadSamples().then(
      value => {
        if (active) setSamples(value);
      },
      reason => {
        if (active) setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    );
    return () => {
      active = false;
    };
  }, []);
  const value = useMemo(
    () => ({
      get: (name: string, data: unknown) => {
        const usable = hasModulePreviewData(name, data, id);
        return usable ? undefined : samples?.[name as keyof PreviewSamples];
      }
    }),
    [id, samples]
  );
  if (error) throw error;
  return <ResourceSamples value={value}>{children}</ResourceSamples>;
}
