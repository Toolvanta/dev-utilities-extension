import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui';

interface Props { children: ReactNode; toolName: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Dev Utility] Tool crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary">
        <AlertTriangle size={26} />
        <h3>{this.props.toolName} ran into a problem</h3>
        <p>{this.state.error.message || 'An unexpected error occurred.'}</p>
        <Button variant="primary" icon={<RotateCcw size={14} />} onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
