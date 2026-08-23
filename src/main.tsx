import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useAuthSession } from "./auth/useAuthSession";
import { AuthGate } from "./components/AuthGate";
import "./styles.css";

if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

function Root() {
  const auth = useAuthSession();
  return auth.status === "authenticated" ? <App /> : <AuthGate state={auth} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
