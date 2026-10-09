import { describe, expect, it } from "vitest";
import { amdWindowsGpu } from "./hardware";

describe("AMD Windows GPU detection", () => {
  it("recognizes the RX 9070 XT from the local DxDiag report", async () => {
    const gpus = await amdWindowsGpu();

    expect(gpus).toHaveLength(1);
    expect(gpus[0].model).toMatch(/AMD Radeon RX 9070 XT/i);
    expect(gpus[0].vramTotalMb).toBe(16188);
    expect(gpus[0].driverVersion).toBe("32.0.31041.1004");
    expect(gpus[0].source).toBe("none");
  });
});
