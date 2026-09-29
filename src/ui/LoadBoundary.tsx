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
// works without. A chunk the server no longer has reloads the page once by itself; when that reload is not allowed,
// the message says doona was updated.
export class LoadBoundary extends Component<{children: ReactNode; fallback?: ReactNode}, {error: Error | null; reloading: boolean}> {
  override state: {error: Error | null; reloading: boolean} = {error: null, reloading: false};

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  override componentDidCatch(error: unknown) {
    if (isChunkLoadError(error) && reloadForStaleChunk()) this.setState({reloading: true});
  }

  override render() {
    // Reload clears both React.lazy's rejected promise and the browser's failed module entry.
    if (!this.state.error) return this.props.children;
    if (isChunkLoadError(this.state.error)) return this.state.reloading ? (this.props.fallback ?? null) : (this.props.fallback ?? <Updated />);
    return this.props.fallback ?? <ErrorMessage error={this.state.error} onRetry={() => location.reload()} />;
  }
}
