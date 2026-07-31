import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches Clerk hook failures (e.g. provider not ready / misconfigured)
 * so a single account widget can't blank the whole screen.
 */
export class ClerkBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[ClerkBoundary] caught:", err.message, info);
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
