import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { MotionConfig as DitherMotionConfig } from "motion/react";

import "@fontsource/ibm-plex-mono/latin-400.css";
import "./fluid.css";
import "./styles.css";
import App from "./App";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="error-panel" role="alert">
        <h1>The view could not be displayed</h1>
        <p>Your data is safe. Reload to try again.</p>
        <button onClick={() => location.reload()}>Reload Calibre</button>
      </div>
    ) : (
      this.props.children
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <DitherMotionConfig reducedMotion="user">
          <App />
        </DitherMotionConfig>
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
