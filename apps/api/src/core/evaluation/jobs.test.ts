import { estimateCost } from "./cost.ts";
import { buildJobs, seededShuffle, type JobPlan } from "./jobs.ts";
import { describe, expect, it } from "vitest";

const plan: JobPlan = {
    questions: [
        { id: "q1", lectureId: "L1" },
        { id: "q2", lectureId: "L1" },
        { id: "q3", lectureId: "L2" },
    ],
    lectureIds: ["L1", "L2"],
    conditions: ["A", "B", "C"],
    tasks: ["qa", "quiz"],
    runs: 2,
    quizRuns: 2,
    seed: 7,
};

describe("buildJobs", () => {
    it("covers every question, lecture, condition and run exactly once", () => {
        const jobs = buildJobs(plan);

        expect(jobs.filter((job) => job.task === "qa")).toHaveLength(3 * 3 * 2);
        expect(jobs.filter((job) => job.task === "quiz")).toHaveLength(2 * 3 * 2);
        expect(new Set(jobs.map((job) => job.key)).size).toBe(jobs.length);
    });

    it("orders jobs the same way for the same seed, and differently for another", () => {
        const order = (seed: number) => buildJobs({ ...plan, seed }).map((job) => job.key);

        expect(order(7)).toEqual(order(7));
        expect(order(7)).not.toEqual(order(8));
        expect(order(7)).not.toEqual(
            buildJobs({ ...plan, seed: 7 })
                .map((job) => job.key)
                .toSorted(),
        );
        expect(seededShuffle([1, 2, 3, 4, 5], 3).toSorted()).toEqual([1, 2, 3, 4, 5]);
    });

    it("limits a pilot to chosen lectures", () => {
        expect(buildJobs({ ...plan, lectureIds: ["L2"] }).every((job) => job.lectureId === "L2")).toBe(true);
    });
});

describe("estimateCost", () => {
    it("prices tokens per million and stays undefined without pricing or usage", () => {
        const pricing = { inputPerMillion: 0.3, outputPerMillion: 1.2 };

        expect(estimateCost({ inputTokens: 10_000, outputTokens: 500 }, pricing)).toBeCloseTo(0.0036);
        expect(estimateCost({ inputTokens: 10_000, outputTokens: 500 }, undefined)).toBeUndefined();
        expect(estimateCost({ inputTokens: undefined, outputTokens: 500 }, pricing)).toBeUndefined();
    });
});
