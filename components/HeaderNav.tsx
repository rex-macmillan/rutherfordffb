import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface HeaderBackConfig {
  href: string;
  label: string;
}

const HeaderNavContext = createContext<{
  back: HeaderBackConfig | null;
  setBack: (back: HeaderBackConfig | null) => void;
} | null>(null);

export function HeaderNavProvider({ children }: { children: ReactNode }) {
  const [back, setBack] = useState<HeaderBackConfig | null>(null);
  return (
    <HeaderNavContext.Provider value={{ back, setBack }}>
      {children}
    </HeaderNavContext.Provider>
  );
}

/** Register a back link in the top header (cleared on unmount). */
export function useHeaderBack(config: HeaderBackConfig | null) {
  const { setBack } = useHeaderNav();
  useEffect(() => {
    setBack(config);
    return () => setBack(null);
  }, [config?.href, config?.label, setBack]);
}

export function useHeaderNav() {
  const ctx = useContext(HeaderNavContext);
  if (!ctx) {
    throw new Error("useHeaderNav must be used within HeaderNavProvider");
  }
  return ctx;
}
