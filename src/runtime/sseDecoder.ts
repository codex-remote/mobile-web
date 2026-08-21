export type ServerSentEvent = {
  id?: string;
  event?: string;
  data: string;
};

export class SseDecoder {
  private buffer = "";
  private eventId: string | undefined;
  private eventType: string | undefined;
  private dataLines: string[] = [];

  push(chunk: string): ServerSentEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    return this.consume(lines);
  }

  finish(): ServerSentEvent[] {
    const lines = this.buffer ? [this.buffer, ""] : [""];
    this.buffer = "";
    return this.consume(lines);
  }

  private consume(lines: string[]): ServerSentEvent[] {
    const events: ServerSentEvent[] = [];
    for (const line of lines) {
      if (line === "") {
        if (this.dataLines.length > 0) {
          events.push({
            id: this.eventId,
            event: this.eventType,
            data: this.dataLines.join("\n"),
          });
        }
        this.eventType = undefined;
        this.dataLines = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const rawValue = separator === -1 ? "" : line.slice(separator + 1);
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "id") this.eventId = value;
      if (field === "event") this.eventType = value;
      if (field === "data") this.dataLines.push(value);
    }
    return events;
  }
}
