import {useEffect} from 'react';
import type {ConfigDiagnostic, ConfigValidationRequest} from '../../api/model';
import {useConfigEditor} from '../../store/config';

// Wait for a pause in typing before validating the full candidate set.
const validationDelay = 600;
const noRefetch = () => {};

export function useBackgroundValidation(sources: ConfigValidationRequest['sources'] | null, receive: (diagnostics: ConfigDiagnostic[]) => void) {
  const {validate, cancel} = useConfigEditor(noRefetch);
  useEffect(() => {
    if (!sources) return;
    let live = true;
    const timer = setTimeout(() => {
      void validate({sources, mode: 'full'}).then(result => {
        if (live && result) receive(result.diagnostics);
      });
    }, validationDelay);
    return () => {
      live = false;
      clearTimeout(timer);
      cancel();
    };
  }, [sources, validate, cancel, receive]);
}
