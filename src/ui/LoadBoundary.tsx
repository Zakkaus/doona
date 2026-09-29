import {Component, type ReactNode} from 'react';
import {useT} from '../i18n';
import {Button} from './Button';
import {ErrorMessage, InlineAlert} from './Feedback';
import {isChunkLoadError, reloadForStaleChunk} from './staleChunk';

// The chunk is gone because doona was updated; a reload fetches the new build.
function Updated() {
  const t = useT();
  return (
    <InlineAlert
      action={
        <Button small quiet onPress={() => location.reload()}>
          {t('ui.reloadPage')}
        </Button>
      }
    >
      {t('ui.staleBuild')}
    </InlineAlert>
  );
}

// A lazy part that fails to load reports it with a retry. `fallback` stands in silently instead, for a part the page
// works without. A chunk the server no longer has reloads the page once by itself, unless the part has a fallback;
// the message that says doona was updated stays up in case the reload is not allowed or is cancelled.
export class LoadBoundary extends Component<{children: ReactNode; fallback?: ReactNode}, {error: Error | null}> {
  override state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  override componentDidCatch(error: unknown) {
    if (this.props.fallback === undefined && isChunkLoadError(error)) reloadForStaleChunk();
  }

  override render() {
    // Reload clears both React.lazy's rejected promise and the browser's failed module entry.
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return isChunkLoadError(this.state.error) ? <Updated /> : <ErrorMessage error={this.state.error} onRetry={() => location.reload()} />;
  }
}
