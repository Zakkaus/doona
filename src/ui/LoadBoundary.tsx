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

// How long the page waits for its own reload before it says doona was updated. A reload that goes ahead replaces the
// page within this time, so the message never flashes on the page that is about to go.
const RELOAD_WAIT_MS = 1000;

// A lazy part that fails to load reports it with a retry. `fallback` stands in silently instead, for a part the page
// works without. A chunk the server no longer has reloads the page once by itself, unless the part has a fallback;
// the message that says doona was updated stays up in case the reload is not allowed, and comes up after
// RELOAD_WAIT_MS if the reload is cancelled.
export class LoadBoundary extends Component<{children: ReactNode; fallback?: ReactNode}, {error: Error | null; reloading: boolean}> {
  override state: {error: Error | null; reloading: boolean} = {error: null, reloading: false};
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  override componentDidCatch(error: unknown) {
    if (this.props.fallback !== undefined || !isChunkLoadError(error) || !reloadForStaleChunk()) return;
    this.setState({reloading: true});
    this.timer = setTimeout(() => this.setState({reloading: false}), RELOAD_WAIT_MS);
  }

  override componentWillUnmount() {
    clearTimeout(this.timer);
  }

  override render() {
    // Reload clears both React.lazy's rejected promise and the browser's failed module entry.
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    if (isChunkLoadError(this.state.error)) return this.state.reloading ? null : <Updated />;
    return <ErrorMessage error={this.state.error} onRetry={() => location.reload()} />;
  }
}
