import React, { createContext, useState, ReactNode, useContext } from "react";

type SidebarId = "keeper" | "draft" | null;

interface SidebarCtx {
  open: SidebarId;
  setOpen: (id: SidebarId) => void;
}

const SidebarContext = createContext<SidebarCtx | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState<SidebarId>(null);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}; 