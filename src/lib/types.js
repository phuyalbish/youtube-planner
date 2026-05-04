export function toTaskDTO(t) {
  return {
    id: t.id,
    channelId: t.channelId,
    day: t.day,
    title: t.title,
    sunoPrompt: t.sunoPrompt ?? "",
    thumbnailText: t.thumbnailText ?? "",
    uploaded: !!t.uploaded,
    uploadedAt: t.uploadedAt ?? null,
    createdAt: t.createdAt,
  };
}
