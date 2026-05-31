interface ReasoningChunk {
  title: string;
  body: string;
}

export function parseReasoningChunks(text: string): ReasoningChunk[] {
  const chunks: ReasoningChunk[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  const titles: { title: string; index: number; length: number }[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    titles.push({
      title: match[1],
      index: match.index,
      length: match[0].length,
    });
  }

  for (let i = 0; i < titles.length; i++) {
    const start = titles[i].index + titles[i].length;
    const end = i + 1 < titles.length ? titles[i + 1].index : text.length;
    chunks.push({
      title: titles[i].title,
      body: text.slice(start, end).trim(),
    });
  }

  return chunks;
}
