import * as RadixTooltip from "@radix-ui/react-tooltip";
import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  if (content == null || content === "") return <>{children}</>;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={5}
          className={cn(
            "z-[1100] max-w-[16rem] rounded-md bg-ink-900 px-2.5 py-1.5",
            "text-xs leading-snug text-white shadow-lg",
            "data-[state=delayed-open]:animate-[overlay-fade_0.15s_ease-out]",
            "data-[state=instant-open]:animate-[overlay-fade_0.15s_ease-out]",
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink-900" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
