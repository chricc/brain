
import { MODEL_ALLOWLIST } from "../../models";
import type { JobPayload } from "../../protocol";
import type { GenerateResult, InferenceBackend } from "./types";

const BASE = process.env.BRAIN_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5:1.5b";
const BRAIN_MODEL = "qwen/qwen2.5-1.5b-instruct";

/**
 * Experimental local Ollama backend.
 *
 * The model mapping is for local integration tests only.
 * It does not establish equivalence with the coordinator's
 * official model or benchmark requirements.
 */
export class OllamaBackend implements InferenceBackend {
  readonly kind = "ollama" as const;

  private loaded = false;

  supportedModels(): string[] {
    return MODEL_ALLOWLIST.some(
      (model) => !model.mock && model.id === BRAIN_MODEL
    )
      ? [BRAIN_MODEL]
      : [];
  }

  loadedModels(): string[] {
    return this.loaded ? [BRAIN_MODEL] : [];
  }

  async ensureLoaded(
    model: string,
    signal: AbortSignal
  ): Promise<boolean> {
    if (model !== BRAIN_MODEL) {
      throw new Error(`Unsupported model: ${model}`);
    }

    if (signal.aborted) {
      throw new Error("Load cancelled");
    }

    const wasLoaded = this.loaded;

    const response = await fetch(`${BASE}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL }),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama model unavailable: HTTP ${response.status}`
      );
    }

    this.loaded = true;
    return !wasLoaded;
  }

  async generate(
    job: JobPayload,
    onDelta: (delta: string, tokens: number) => void,
    signal: AbortSignal
  ): Promise<GenerateResult> {
    if (job.model !== BRAIN_MODEL) {
      throw new Error(`Unsupported model: ${job.model}`);
    }

    const response = await fetch(
      `${BASE}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: job.messages,
          max_tokens: job.maxTokens,
          temperature: job.temperature,
          stop: job.stop,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(
        `Ollama HTTP ${response.status}: ` +
        (await response.text()).slice(0, 200)
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let content = "";
    let chunks = 0;
    let finishReason: GenerateResult["finishReason"] = "stop";
    let usage: GenerateResult["usage"] | null = null;
    let completed = false;

    const processLine = (line: string): void => {
      const trimmed = line.trim();

      if (!trimmed.startsWith("data:")) return;

      const payload = trimmed.slice(5).trim();

      if (payload === "[DONE]") {
        completed = true;
        return;
      }

      const event = JSON.parse(payload);
      const delta = event.choices?.[0]?.delta?.content;

      if (typeof delta === "string" && delta.length > 0) {
        content += delta;
        chunks++;
        onDelta(delta, chunks);
      }

      const reason = event.choices?.[0]?.finish_reason;

      if (reason === "length") {
        finishReason = "length";
      }

      if (
        typeof event.usage?.prompt_tokens === "number" &&
        typeof event.usage?.completion_tokens === "number"
      ) {
        usage = {
          prompt: event.usage.prompt_tokens,
          completion: event.usage.completion_tokens,
        };
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim().startsWith("data:")) {
            processLine(line);
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim().startsWith("data:")) {
        processLine(buffer);
      }
    } catch (error) {
      if (signal.aborted) {
        return {
          content,
          finishReason: "cancelled",
          usage: usage ?? {
            prompt: 0,
            completion: chunks,
          },
        };
      }

      throw error;
    } finally {
      reader.releaseLock();
    }

    if (signal.aborted) {
      finishReason = "cancelled";
    } else if (!completed) {
      throw new Error("Ollama stream ended without [DONE]");
    }

    if (!signal.aborted && usage === null) {
      throw new Error("Ollama token usage missing from completed stream");
    }

    return {
      content,
      finishReason,
      usage: usage ?? {
        prompt: 0,
        completion: chunks,
      },
    };
  }

  async shutdown(): Promise<void> {
    this.loaded = false;
  }
}
