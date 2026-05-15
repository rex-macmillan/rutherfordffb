import { ReactNode } from "react";
import * as RTabs from "@radix-ui/react-tabs";
import { cn } from "../../lib/cn";

export const Tabs = RTabs.Root;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RTabs.List
      className={cn(
        "flex gap-1 border-b border-ink-200 px-2 pt-2",
        className,
      )}
    >
      {children}
    </RTabs.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RTabs.Trigger
      value={value}
      className={cn(
        "rounded-t-md px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors",
        "hover:text-ink-800",
        "data-[state=active]:bg-white data-[state=active]:text-ink-900",
        "data-[state=active]:shadow-[0_-1px_0_var(--color-ink-200),_-1px_0_0_var(--color-ink-200),_1px_0_0_var(--color-ink-200)]",
        className,
      )}
    >
      {children}
    </RTabs.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RTabs.Content
      value={value}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </RTabs.Content>
  );
}
