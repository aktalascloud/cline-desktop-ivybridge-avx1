"use client";

import { Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { AgentContextUsage, type AgentContextUsageData } from "@cline/ui";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatCostUsd } from "@/hooks/use-session-history";

/** Native popover, trigger styling, and cost formatting remain desktop-owned. */
export function TokenUsageRing({
	usage,
	compacted,
}: {
	usage: AgentContextUsageData & { totalCost?: number };
	compacted?: boolean;
}) {
	const t = useTranslation();
	return (
		<AgentContextUsage usage={usage} costLabel={formatCostUsd(usage.totalCost)}>
			{({ triggerLabel, ring, details }) => (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							aria-label={compacted ? t("Context compacted") : triggerLabel}
							className="size-7 shrink-0 p-0 text-muted-foreground data-[state=open]:bg-surface-hover opacity-65 hover:opacity-100"
							id="token-usage"
							size="icon-sm"
							type="button"
							variant="text"
						>
							{compacted ? <Check className="size-3.5 text-green-500" /> : ring}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-80 p-0"
						id="token-usage-panel"
						side="top"
						sideOffset={8}
					>
						{compacted && (
							<div className="px-3 pt-3 text-sm">
								{t(
									"Context compacted. The next request uses the summary. Usage below is from the previous request.",
								)}
							</div>
						)}
						{details}
					</PopoverContent>
				</Popover>
			)}
		</AgentContextUsage>
	);
}
