import {Component, type ReactNode} from 'react';
import {ErrorMessage} from './Feedback';

export class LoadBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  render() {
    // Reload clears both React.lazy's rejected promise and the browser's failed module entry.
    return this.state.error ? <ErrorMessage error={this.state.error} onRetry={() => location.reload()} /> : this.props.children;
  }
}
