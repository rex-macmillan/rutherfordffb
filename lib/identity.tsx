/**
 * Sleeper-username "identity" — no real auth, just a stored handle.
 *
 * The site is a friend-league tool, so the auth model is intentionally
 * minimal: the user types their Sleeper username, we validate it against the
 * public API, and we store it in a long-lived cookie. The username drives
 * which league/roster the user is acting as.
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const COOKIE_NAME = "sleeper_username";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; samesite=lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; max-age=0; path=/`;
}

interface IdentityCtx {
  username: string | undefined;
  ready: boolean;
  setUsername: (u: string) => void;
  signOut: () => void;
}

const Ctx = createContext<IdentityCtx | undefined>(undefined);

export const IdentityProvider = ({ children }: { children: ReactNode }) => {
  const [username, setUsernameState] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUsernameState(readCookie(COOKIE_NAME));
    setReady(true);
  }, []);

  const setUsername = useCallback((u: string) => {
    const trimmed = u.trim();
    if (!trimmed) return;
    writeCookie(COOKIE_NAME, trimmed);
    setUsernameState(trimmed);
  }, []);

  const signOut = useCallback(() => {
    clearCookie(COOKIE_NAME);
    setUsernameState(undefined);
  }, []);

  const value = useMemo(
    () => ({ username, ready, setUsername, signOut }),
    [username, ready, setUsername, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useIdentity() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useIdentity must be used inside IdentityProvider");
  return ctx;
}
