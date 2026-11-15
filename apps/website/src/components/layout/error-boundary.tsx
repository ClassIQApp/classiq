import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorFallbackProps {
    onReload: () => void;
}

export function ErrorFallback({ onReload }: ErrorFallbackProps) {
    return (
        <div className="error-fallback" role="alert">
            <h1>Something went wrong</h1>
            <p>The page hit an unexpected problem. Reloading usually fixes it.</p>
            <button type="button" className="error-fallback-button" onClick={onReload}>
                Reload page
            </button>
        </div>
    );
}

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Unhandled render error", error, info.componentStack);
    }

    render() {
        return this.state.failed ? <ErrorFallback onReload={() => location.reload()} /> : this.props.children;
    }
}
