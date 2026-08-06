import React from 'react';

interface Props {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#090d16] text-slate-100">
          <div className="max-w-md w-full bg-[#0f172a] border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-red-400 text-2xl">!</span>
            </div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-slate-400">
              An unexpected error occurred while loading this page. Please try refreshing or navigating back.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
