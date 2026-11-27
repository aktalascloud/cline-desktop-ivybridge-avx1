"use client";
import { t, useTranslation } from "@/lib/i18n";

import { AgentImageLightboxContent } from "@cline/ui";
import type { ChatMessageImage } from "@/lib/chat-schema";

export function ChatImageLightbox({
	image,
	onClose,
}: {
	image: ChatMessageImage;
	onClose: () => void;
}) {
	const t = useTranslation();
	return (
		<div
			aria-label={t("Expanded attachment")}
			aria-modal="true"
			className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
			role="dialog"
		>
			<AgentImageLightboxContent
				src={`data:${image.mediaType};base64,${image.data}`}
				alt={t("Expanded attachment")}
				onClose={onClose}
			/>
		</div>
	);
}
