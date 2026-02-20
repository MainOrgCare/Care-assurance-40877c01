export type SseEventPayload = {
  eventType: string;
  data: unknown;
  rawData: string;
};

type SseEventHandler = (event: SseEventPayload) => void | Promise<void>;

const parseSseMessage = (message: string): { eventType: string; rawData: string } | null => {
  if (!message || !message.trim()) return null;
  const lines = message.split("\n");
  let eventType = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      const parsedEvent = line.slice(6).trim();
      if (parsedEvent) eventType = parsedEvent;
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;
  return { eventType, rawData: dataLines.join("\n") };
};

const parseSseData = (rawData: string): unknown => {
  const trimmed = rawData.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return rawData;
  }
};

export async function consumeJsonSseStream(response: Response, onEvent: SseEventHandler): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response stream available");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const processMessage = async (message: string) => {
    const parsed = parseSseMessage(message);
    if (!parsed) return;
    const data = parseSseData(parsed.rawData);
    await onEvent({ eventType: parsed.eventType, data, rawData: parsed.rawData });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const message = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        await processMessage(message);
        boundaryIndex = buffer.indexOf("\n\n");
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      await processMessage(remaining);
    }
  } catch (error) {
    // Release the reader lock so the underlying stream can be garbage collected
    reader.releaseLock();
    // Re-throw with more context for callers to handle
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error; // Let abort signals propagate cleanly
    }
    throw new Error(
      `SSE stream error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
