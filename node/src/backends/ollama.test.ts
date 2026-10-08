
import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaBackend } from "./ollama";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaBackend", () => {
  it("generates a streamed response without a real Ollama server", async () => {
    const events = [
      'data: {"choices":[{"delta":{"content":"FUN"}}]}',
      'data: {"choices":[{"delta":{"content":"ZIONA"},"finish_reason":"stop"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}',
      "data: [DONE]",
      "",
    ].join("\n\n");

    const encoder = new TextEncoder();

    const mockFetch = vi.fn(async (_url: string, _options?: RequestInit) => {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(events));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }
      );
    });

    vi.stubGlobal("fetch", mockFetch);

    const backend = new OllamaBackend();
    const deltas: string[] = [];

    const result = await backend.generate(
      {
        jobId: "test-ollama-stream",
        model: "qwen/qwen2.5-1.5b-instruct",
        messages: [
          { role: "user", content: "Rispondi FUNZIONA" },
        ],
        maxTokens: 32,
        temperature: 0,
        deadlineAt: Date.now() + 60_000,
        flushMs: 100,
      },
      (delta) => deltas.push(delta),
      new AbortController().signal
    );

    expect(result.content).toBe("FUNZIONA");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      prompt: 12,
      completion: 4,
    });
    expect(deltas).toEqual(["FUN", "ZIONA"]);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/v1/chat/completions");
    expect(options?.method).toBe("POST");
  });
});
