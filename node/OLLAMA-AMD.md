

\# BRAIN Node — Experimental AMD + Ollama Support



\## Overview



This branch adds experimental Ollama inference support to BRAIN Node.



It has been tested on Windows with an AMD Radeon RX 9070 XT (16 GB VRAM).



The implementation uses Ollama's local HTTP API and does not require NVIDIA CUDA or vLLM.



\## Tested environment



\- Operating system: Windows

\- GPU: AMD Radeon RX 9070 XT

\- VRAM: 16 GB

\- Ollama: 0.40.1

\- Model: qwen2.5:1.5b

\- BRAIN model ID: qwen/qwen2.5-1.5b-instruct

\- Node.js: 24



\## Installation



Install Node.js, Git and Ollama.



Clone the BRAIN repository and install dependencies:



```powershell

git clone https://github.com/UseBrainNetwork/brain.git

cd brain

npm.cmd ci

cd node

npm.cmd ci

```



Note: Ollama support is experimental and requires the changes in the amd-ollama-node branch. The upstream main branch may not contain these changes.



Download the tested model:



```powershell

ollama pull qwen2.5:1.5b

```



Ensure the Ollama service is running locally.



\## Start the local coordinator



From the repository root:



```powershell

npm.cmd run dev -- --hostname 127.0.0.1

```



The coordinator will be available at:



http://127.0.0.1:3000



\## Start the Ollama node



Open another PowerShell window:



```powershell

cd brain\\node

$env:BRAIN\_NODE\_MODE="ollama"

$env:BRAIN\_COORDINATOR\_URL="http://127.0.0.1:3000"

$env:BRAIN\_NODE\_CONCURRENCY="1"

npx.cmd tsx src/main.ts

```



The Ollama mode includes a safety guard that rejects non-local coordinator addresses.



\## Local integration results



The following results were observed using the modified local BRAIN coordinator:



\- Node ID: N-7804EC64

\- Registration status: ONLINE

\- GPU: AMD Radeon RX 9070 XT

\- Reported VRAM: 16 GB

\- Backend: Ollama

\- Completed jobs: 2

\- Generated tokens: 134

\- Verification probes passed: 1



After merging the latest upstream changes:



\- TypeScript typecheck: passed

\- Automated tests: 230 passed, 3 skipped, 0 failed



\## Limitations



\- AMD GPU telemetry is incomplete.

\- GPU details are reported by the node, not independently verified.

\- Ollama model mapping is currently limited to the tested model.

\- The official public BRAIN coordinator has not been confirmed to support the Ollama backend.

\- Local job completion does not establish eligibility for SOL rewards.

\- The coordinator must also recognize Ollama in its protocol, node registry and job reporting.

\- Dependencies and security advisories should be reviewed before production deployment.



\## Status



Experimental proof of concept.



AMD + Ollama successfully registered and completed inference jobs through a modified local BRAIN coordinator.



Public-network compatibility and reward eligibility remain unverified.



