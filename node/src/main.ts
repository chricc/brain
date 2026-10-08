import { Agent } from "./agent";
import { MockBackend } from "./backends/mock";
import { OllamaBackend } from "./backends/ollama";
import type { InferenceBackend } from "./backends/types";
import { VllmBackend } from "./backends/vllm";
import { nvidiaSmi } from "./hardware";
import { loadIdentity } from "./identity";
import { HttpTransport } from "./transport";

/**
 * Brain Node entry point.
 *
 *   BRAIN_COORDINATOR_URL   coordinator base URL (default https://brainnetwork.app)
 *   BRAIN_NODE_MODE         mock | vllm   (default: vllm when an NVIDIA GPU is detected, else mock)
 *   BRAIN_NODE_MODELS       comma-separated allowlisted model ids to serve (vllm; default: all that fit)
 *   BRAIN_NODE_REGION       coarse region label, e.g. eu-west (optional)
 *   BRAIN_NODE_WALLET       Solana address for payouts (optional, verified later via /earn)
 *   BRAIN_NODE_CONCURRENCY  parallel jobs (default 1 mock, 4 vllm)
 *   BRAIN_NODE_ASK_USD_PER_1M  your ask per 1M output tokens (optional)
 *   BRAIN_NODE_HOME         identity directory (default ~/.brain-node)
 *   HF_TOKEN                forwarded to vLLM for gated models
 */
async function main() {
  const id = loadIdentity();
  const url = process.env.BRAIN_COORDINATOR_URL || "https://brainnetwork.app";
if (process.env.BRAIN_NODE_MODE === "ollama") {
  const coordinator = new URL(url);
  const host = coordinator.hostname.toLowerCase();

  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      "Modalità Ollama sperimentale: consentito soltanto un coordinatore locale."
    );
  }
}
  const gpus = await nvidiaSmi();
  const mode = process.env.BRAIN_NODE_MODE || (gpus.length ? "vllm" : "mock");
  if (mode !== "mock" && mode !== "vllm" && mode !== "ollama")
  throw new Error(`BRAIN_NODE_MODE must be mock, vllm or ollama, got ${mode}`);
  const mock = mode === "mock";
  if (mode === "vllm" && !gpus.length)
  throw new Error("BRAIN_NODE_MODE=vllm richiede una GPU NVIDIA rilevata da nvidia-smi.");
  const models = (process.env.BRAIN_NODE_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  
const backend: InferenceBackend =
  mode === "mock"
    ? new MockBackend()
    : mode === "ollama"
      ? new OllamaBackend()
      : new VllmBackend({
          gpus,
          models: models.length ? models : undefined,
          hfToken: process.env.HF_TOKEN,
          log: (l) => console.log(`${new Date().toISOString()} ${l}`),
        });

  const concurrency = Number(process.env.BRAIN_NODE_CONCURRENCY) || (mode === "vllm" ? 4 : 1);
  const ask = process.env.BRAIN_NODE_ASK_USD_PER_1M ? Number(process.env.BRAIN_NODE_ASK_USD_PER_1M) : null;

 
const modeLabel =
  mode === "mock"
    ? "MOCK mode (simulated GPU)"
    : mode === "ollama"
      ? "Ollama mode · AMD GPU"
      : `vLLM mode · ${gpus.map((g) => g.model).join(", ")}`;

console.log(`Brain Node ${id.nodeId} · ${modeLabel} · coordinator ${url}`);

  const agent = new Agent(id, new HttpTransport(url, id), backend, {
    mock,
    region: process.env.BRAIN_NODE_REGION || null,
    wallet: process.env.BRAIN_NODE_WALLET,
    maxConcurrency: concurrency,
    askUsdPer1MTokens: ask != null && Number.isFinite(ask) ? ask : null,
    models: models.length ? models : undefined,
    agentVersion: "0.1.0",
  });
  const stop = () => void agent.stop().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await agent.run();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
