
import { createHash } from "node:crypto";
import { Agent } from "./src/agent";
import { OllamaBackend } from "./src/backends/ollama";
import type { Transport } from "./src/transport";
import type { JobPayload } from "./protocol";

const MODEL = "qwen/qwen2.5-1.5b-instruct";

async function main() {
  const backend = new OllamaBackend();

  let agent: Agent;
  let delivered = false;
  let completed = false;

  const job: JobPayload = {
    jobId: "amd-local-test-001",
    model: MODEL,
    messages: [
      {
        role: "user",
        content: "Rispondi soltanto con la parola FUNZIONA",
      },
    ],
    maxTokens: 30,
    temperature: 0,
    deadlineAt: Date.now() + 120_000,
    flushMs: 100,
  };

  const transport: Transport = {
    kind: "http",

    rttMs() {
      return 0;
    },

    async call<T>(path: string, body: unknown): Promise<T> {
      if (path === "/api/coordinator/register") {
        const registration = body as any;

        console.log(
          "GPU registrata:",
          registration.hardware.gpus[0]
        );

        console.log(
          "Modelli dichiarati:",
          registration.capabilities.supportedModels
        );

        return {
          nodeId: registration.nodeId,
          state: "ONLINE",
          acceptedModels: [MODEL],
        } as T;
      }

      if (path === "/api/coordinator/heartbeat") {
        return { instruction: "continue" } as T;
      }

      if (path === "/api/coordinator/work") {
        if (!delivered) {
          delivered = true;
          return { job, serverTime: Date.now() } as T;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 100)
        );

        return {
          job: null,
          serverTime: Date.now(),
        } as T;
      }

      if (path.endsWith("/started")) {
        console.log("Lavoro avviato");
        return { ok: true } as T;
      }

      if (path.endsWith("/progress")) {
        const progress = body as {
          seq: number;
          delta: string;
          tokens: number;
        };

        console.log(
          `Progress ${progress.seq}:`,
          progress.delta
        );

        return { ok: true } as T;
      }

      if (path.endsWith("/completed")) {
        const result = body as {
          content: string;
          responseHash: string;
          usage: {
            prompt: number;
            completion: number;
          };
        };

        const expectedHash = createHash("sha256")
          .update(result.content)
          .digest("hex");

        if (expectedHash !== result.responseHash) {
          throw new Error("Hash della risposta non valido");
        }

        console.log("\nRISPOSTA FINALE:", result.content);
        console.log("TOKEN:", result.usage);
        console.log("HASH SHA-256: verificato");

        completed = true;

        // Arrestiamo l'agente dopo la risposta,
        // senza interrompere il lavoro corrente.
        setImmediate(() => {
          void agent.stop();
        });

        return {
          state: "COMPLETED",
          receiptId: null,
          failureReason: null,
        } as T;
      }

      if (path.endsWith("/failed")) {
        console.error("Lavoro fallito:", body);
        return { ok: true } as T;
      }

      throw new Error(`Percorso inatteso: ${path}`);
    },
  };

  const identity = {
    nodeId: "local-amd-test-node",
    publicKey: "local-test-only",
  } as any;

  agent = new Agent(identity, transport, backend, {
    mock: false,
    region: "eu-west",
    maxConcurrency: 1,
    askUsdPer1MTokens: null,
    models: [MODEL],
    agentVersion: "0.1.0-local-test",
  });

  // Protezione contro un test che rimane bloccato.
  const timeout = setTimeout(() => {
    console.error("Timeout del test locale");
    void agent.stop();
  }, 120_000);

  try {
    await agent.run();

    if (!completed) {
      throw new Error("Il lavoro non è stato completato");
    }

    console.log("\nTEST AGENTE BRAIN SUPERATO!");
  } finally {
    clearTimeout(timeout);
    await agent.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
