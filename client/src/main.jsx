import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { DriverProvider } from "./context/DriverContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouteErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          {/* DriverProvider is separate from AuthProvider — manages phone+password driver sessions */}
          <DriverProvider>
            <App />
          </DriverProvider>
        </AuthProvider>
      </BrowserRouter>
    </RouteErrorBoundary>
  </StrictMode>,
);
