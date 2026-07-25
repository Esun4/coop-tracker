import { describe, it, expect } from "vitest";
import {
  METER_TICKS,
  STAGE_COUNT,
  filledTicks,
  isClosedStage,
  isInPlay,
  stageDepth,
  stageGroup,
} from "@/lib/stage";
import { applicationStatuses } from "@/lib/schemas";

// The stage vocabulary drives every colour, tick and grouping decision in the
// UI, so the invariants matter more than any single mapping.

describe("stage depth", () => {
  it("deepens monotonically along the pipeline", () => {
    const ladder = ["APPLIED", "OA", "INTERVIEW", "FINAL_ROUND", "OFFER"] as const;
    const depths = ladder.map(stageDepth);
    expect(depths).toEqual([1, 2, 3, 4, 5]);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it("puts terminal states outside the ramp rather than at the end of it", () => {
    expect(stageDepth("REJECTED")).toBe(0);
    expect(stageDepth("WITHDRAWN")).toBe(0);
  });

  it("never exceeds the number of stages", () => {
    for (const status of applicationStatuses) {
      expect(stageDepth(status)).toBeLessThanOrEqual(STAGE_COUNT);
    }
  });
});

describe("stage meter", () => {
  it("fills one tick per stage, capped at the tick count", () => {
    expect(filledTicks("APPLIED")).toBe(1);
    expect(filledTicks("OA")).toBe(2);
    expect(filledTicks("INTERVIEW")).toBe(3);
    expect(filledTicks("FINAL_ROUND")).toBe(4);
    // Offer is stage 5 of 5 but there are only four ticks; its solid chip is
    // what tells it apart from a final round.
    expect(filledTicks("OFFER")).toBe(4);
  });

  it("leaves every tick empty for closed applications", () => {
    expect(filledTicks("REJECTED")).toBe(0);
    expect(filledTicks("WITHDRAWN")).toBe(0);
  });

  it("never fills more ticks than exist", () => {
    for (const status of applicationStatuses) {
      expect(filledTicks(status)).toBeLessThanOrEqual(METER_TICKS);
      expect(filledTicks(status)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("grouping", () => {
  it("groups by whose move is next, not by stage order", () => {
    // Assessment sits below Interview here on purpose: an interview needs
    // preparing, an assessment is already underway.
    expect(stageGroup("INTERVIEW")).toBe("action");
    expect(stageGroup("FINAL_ROUND")).toBe("action");
    expect(stageGroup("OFFER")).toBe("action");
    expect(stageGroup("OA")).toBe("progress");
    expect(stageGroup("APPLIED")).toBe("waiting");
  });

  it("agrees with itself about what is closed", () => {
    for (const status of applicationStatuses) {
      expect(isClosedStage(status)).toBe(stageGroup(status) === "closed");
      expect(isInPlay(status)).toBe(!isClosedStage(status));
    }
  });

  it("keeps an unrecognised status visible rather than silently hiding it", () => {
    const unknown = "SOMETHING_NEW" as never;
    expect(isInPlay(unknown)).toBe(true);
    expect(isClosedStage(unknown)).toBe(false);
  });

  it("reconciles: every status lands in exactly one group", () => {
    const counts = { action: 0, progress: 0, waiting: 0, closed: 0 };
    for (const status of applicationStatuses) counts[stageGroup(status)]++;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(applicationStatuses.length);
    expect(counts.closed).toBe(2);
  });
});
