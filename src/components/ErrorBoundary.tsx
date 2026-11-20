import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as {error?: string; operationType?: string; path?: string};
      if (parsed && parsed.error) {
        readable = `Sync error (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'database'}): ${parsed.error}`;
      }
    } catch {
      // Not JSON, keep message
    }
    return {hasError: true, message: readable};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E4E6DF] rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-semibold text-[#18221D]">Something went wrong</h1>
            <p className="text-sm text-[#4B5850] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({hasError: false, message: ''});
                window.location.reload();
              }}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
