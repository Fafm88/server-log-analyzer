import { Check, X, HelpCircle, AlertTriangle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BotBadge } from "@/lib/bot-verifier";

/**
 * Small status icon shown next to a bot name in tables.
 * Gives the user instant visual feedback about whether the bot
 * is really who it claims to be.
 */
export function BotVerifyBadge({
  badge,
  botName,
}: {
  badge: BotBadge;
  botName: string;
}) {
  if (badge === "unchecked") return null;

  const map = {
    verified: {
      Icon: Check,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-500/10",
      title: `${botName}: проверено — настоящий бот`,
    },
    fake: {
      Icon: X,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
      title: `${botName}: подделка — все IP не прошли проверку`,
    },
    partial: {
      Icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      title: `${botName}: частично — есть поддельные IP`,
    },
    unverifiable: {
      Icon: HelpCircle,
      color: "text-muted-foreground",
      bg: "bg-muted",
      title: `${botName}: нельзя проверить (нет PTR-записи)`,
    },
  } as const;

  const { Icon, color, bg, title } = map[badge];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${bg} ${color}`}
            data-testid={`verify-badge-${badge}`}
            aria-label={title}
          >
            <Icon className="w-2.5 h-2.5" strokeWidth={3} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
