import { EbButton } from "@electricblazor/react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/*
 * A step that throws while rendering shows this instead of taking the whole app down with it. The
 * work is already autosaved, so the way out is simply to try again: the tabs and header keep
 * working, and the other steps are untouched.
 */

interface ErrorBoundaryProps {
    /** Changing it clears a caught error — the step that failed gets a fresh start when revisited. */
    resetKey: string;
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
    resetKey: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { error };
    }

    static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
        return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("Label Printer step failed", error, info.componentStack);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        return (
            <div className="lp-step">
                <div className="lp-issue lp-issue-error" role="alert" style={{ alignSelf: "start", flexDirection: "column" }}>
                    <strong>Something went wrong on this step.</strong>
                    <span>Your label and data are saved. Try again, or switch to another step and back.</span>
                    <code className="lp-small">{this.state.error.message}</code>
                    <div>
                        <EbButton onClick={() => this.setState({ error: null })}>Try again</EbButton>
                    </div>
                </div>
            </div>
        );
    }
}
