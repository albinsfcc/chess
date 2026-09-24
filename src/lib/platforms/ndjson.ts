export type JsonLine = { value: unknown; line: number } | { error: string; line: number };

export async function* readNdjson(body: ReadableStream<Uint8Array>, signal: AbortSignal, maxBytes = 25_000_000): AsyncGenerator<JsonLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "", total = 0, line = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  function parse(text: string): JsonLine {
    line++;
    try { return { value: JSON.parse(text), line }; }
    catch { return { error: `Malformed record at line ${line}; skipped.`, line }; }
  }
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) { pending += decoder.decode(); break; }
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Stream size limit reached");
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) {
        const text = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
        if (text.length > 1_000_000) { yield { error: `Oversized record at line ${++line}; skipped.`, line }; }
        else if (text) yield parse(text);
      }
      if (pending.length > 1_000_000) throw new Error("Record size limit reached");
    }
    if (pending.trim()) yield parse(pending.trim());
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
