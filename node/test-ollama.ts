
import { OllamaBackend } from "./src/backends/ollama";

async function main() {
  const backend = new OllamaBackend();
  const signal = new AbortController().signal;
  const model = "qwen/qwen2.5-1.5b-instruct";

  console.log("Modello:", model);

  await backend.ensureLoaded(model, signal);

  console.log("Generazione in corso:");

  const result = await backend.generate(
    {
      jobId: "local-test-001",
      model,
      messages: [
        {
          role: "user",
          content: "Rispondi soltanto con la parola FUNZIONA",
        },
      ],
      maxTokens: 30,
      temperature: 0,
      deadlineAt: Date.now() + 60_000,
      flushMs: 100,
    },
    (delta) => process.stdout.write(delta),
    signal
  );

  console.log("\n\nRisultato:", result);
  await backend.shutdown();
}

main().catch(console.error);
