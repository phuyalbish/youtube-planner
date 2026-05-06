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
    downloaded: !!t.downloaded,
    downloadedAt: t.downloadedAt ?? null,
    createdAt: t.createdAt,
    sunoGeneration: t.sunoGeneration ?? null,
  };
}

export function defaultSettings() {
  return {
    suno: {
      libraryToken: "",
      libraryDownloadDir: "suno-library",
      libraryDownloadFormat: "wav",
    },
  };
}
