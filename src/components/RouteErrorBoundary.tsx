import { Component, type ReactNode } from "react";
import { ErrorNotice } from "./ui";

/** Keep navigation usable if a page or its downloaded module fails. */
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div className="error-page">
          <ErrorNotice message="This page could not be opened. Reload to try again." />
          <button className="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    return this.props.children;
  }
}
