import { useEffect, useState } from "react";
import { authSession, type AuthState } from "./AuthSession";

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>(authSession.snapshot);
  useEffect(() => {
    const unsubscribe = authSession.subscribe(setState);
    const handleHashChange = () => void authSession.handleLocationChange();
    window.addEventListener("hashchange", handleHashChange);
    void authSession.bootstrap();
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      unsubscribe();
    };
  }, []);
  return state;
}
