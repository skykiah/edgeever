const WECHAT_IMAGE_HOSTS = new Set([
  "mmbiz.qpic.cn",
  "mmbiz.qlogo.cn",
]);

export const getImageReferrerPolicy = (source: unknown): "no-referrer" | undefined => {
  if (typeof source !== "string" || !source.trim()) {
    return undefined;
  }

  try {
    const url = new URL(source);
    if ((url.protocol === "http:" || url.protocol === "https:") && WECHAT_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
      return "no-referrer";
    }
  } catch {
    // Relative, data, and malformed sources keep the browser's default policy.
  }

  return undefined;
};
