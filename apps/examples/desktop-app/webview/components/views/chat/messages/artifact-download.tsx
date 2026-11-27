"use client";

import { Download, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useArtifactResource } from "@/hooks/use-artifact-resource";

export function ArtifactDownload({
	sessionId,
	artifactId,
	iconOnly = false,
	className,
	children,
}: {
	sessionId: string;
	artifactId: string;
	iconOnly?: boolean;
	className?: string;
	children?: (control: ReactNode) => ReactNode;
}) {
	const t = useTranslation();
	const { accountReady, state, open } = useArtifactResource({
		sessionId,
		reference: { type: "artifact", artifactId },
	});
	const busy = state.status === "loading";
	const failed = state.status === "error";
	const label = busy
		? t("Preparing…")
		: failed
			? t("Retry download")
			: t("Download");
	const control = (
		<>
			<Button
				type="button"
				size={iconOnly ? "icon-lg" : "sm"}
				variant="outline"
				className={className}
				aria-label={iconOnly ? label : undefined}
				title={iconOnly ? label : undefined}
				disabled={!accountReady || busy}
				onClick={() => void open()}
			>
				{iconOnly ? (
					busy ? (
						<LoaderCircle
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					) : (
						<Download
							aria-hidden="true"
							className={failed ? "size-4 text-destructive" : "size-4"}
						/>
					)
				) : (
					label
				)}
			</Button>
			{failed && (
				<output className={iconOnly ? "sr-only" : "text-destructive"}>
					{t("Could not download this file.")}
				</output>
			)}
		</>
	);
	return (
		<>
			{control}
			{/* Closing the viewer removes its button, not the shared download request. */}
			{children?.(control)}
		</>
	);
}
