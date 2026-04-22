import { HelpCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReactNode } from "react";

/**
 * Column-header wrapper with a built-in "?" help icon that shows
 * a plain-language tooltip on hover.
 *
 * Usage:
 *   <ColumnHelp text="What this column means">User-Agent</ColumnHelp>
 *
 * Keeps the header compact (no full sentence inline) while making
 * the meaning discoverable for anyone unfamiliar with SEO / DNS jargon.
 */
export function ColumnHelp({
  children,
  text,
  align = "left",
}: {
  children: ReactNode;
  text: ReactNode;
  align?: "left" | "right" | "center";
}) {
  const justify =
    align === "right" ? "justify-end" :
    align === "center" ? "justify-center" : "justify-start";

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 cursor-help ${justify} w-full`}>
            <span>{children}</span>
            <HelpCircle className="w-3 h-3 text-muted-foreground/60 shrink-0" strokeWidth={2} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
