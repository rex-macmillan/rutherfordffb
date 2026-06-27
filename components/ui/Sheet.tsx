import { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/cn";

/**
 * Slide-out side panel built on Radix Dialog. Accessible by default
 * (focus trap, ESC to close, ARIA roles).
 */

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  children,
  side = "right",
  className,
  title,
}: {
  children: ReactNode;
  side?: "right" | "left" | "bottom";
  className?: string;
  title?: string;
}) {
  const sideClasses =
    side === "right"
      ? "right-0 inset-y-0 w-[min(420px,90vw)] border-l data-[state=open]:animate-slide-in-right"
      : side === "left"
      ? "left-0 inset-y-0 w-[min(420px,90vw)] border-r data-[state=open]:animate-slide-in-left"
      : "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-slide-in-bottom";

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm data-[state=open]:animate-overlay-fade" />
      <Dialog.Content
        className={cn(
          "fixed z-[1001] flex flex-col bg-white shadow-2xl outline-none",
          sideClasses,
          className,
        )}
      >
        {title && (
          <Dialog.Title className="border-b border-ink-200 px-4 py-3 text-base font-semibold">
            {title}
          </Dialog.Title>
        )}
        {!title && <Dialog.Title className="sr-only">Side panel</Dialog.Title>}
        <Dialog.Description className="sr-only">
          League information panel
        </Dialog.Description>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <Dialog.Close
          aria-label="Close panel"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
        >
          ×
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
