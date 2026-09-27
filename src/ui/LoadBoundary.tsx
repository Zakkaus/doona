import {Component, type ReactNode} from 'react';
import {ErrorMessage} from './Feedback';

// A lazy part that fails to load reports it with a retry. `fallback` stands in silently instead, for a part the page
// works without.
export class LoadBoundary extends Component<{children: ReactNode; fallback?: ReactNode}, {error: Error | null}> {
  override state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  override render() {
    // Reload clears both React.lazy's rejected promise and the browser's failed module entry.
    if (!this.state.error) return this.props.children;
    return this.props.fallback ?? <ErrorMessage error={this.state.error} onRetry={() => location.reload()} />;
  }
}
