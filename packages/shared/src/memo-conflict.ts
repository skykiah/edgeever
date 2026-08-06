/** Format a conflicted local draft for clipboard recovery (title, tags, body). */
export const formatLocalDraftClipboardText = (input: {
  title: string;
  tags: string[];
  contentMarkdown: string;
}) => {
  const parts: string[] = [];
  const title = input.title.trim();
  if (title) {
    parts.push(`# ${title}`);
  }
  if (input.tags.length > 0) {
    parts.push(input.tags.map((tag) => `#${tag}`).join(" "));
  }
  const body = input.contentMarkdown.replace(/\s+$/u, "");
  if (body) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(body);
  }
  return parts.join("\n");
};
