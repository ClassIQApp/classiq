export type Condition = "A" | "B" | "C";
export type Task = "qa" | "quiz";

export interface Job {
    readonly key: string;
    readonly task: Task;
    readonly lectureId: string;
    readonly questionId?: string;
    readonly condition: Condition;
    readonly run: number;
}

export interface JobPlan {
    readonly questions: readonly { readonly id: string; readonly lectureId: string }[];
    readonly lectureIds: readonly string[];
    readonly conditions: readonly Condition[];
    readonly tasks: readonly Task[];
    readonly runs: number;
    readonly quizRuns: number;
    readonly seed: number;
}

export function jobKey(task: Task, lectureId: string, questionId: string | undefined, condition: Condition, run: number): string {
    return [task, lectureId, questionId ?? "-", condition, run].join(":");
}

export function createRandom(seed: number) {
    let state = seed >>> 0 || 1;

    return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;

        return state / 2 ** 32;
    };
}

const upTo = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
    const next = createRandom(seed);
    const shuffled = [...items];

    for (const index of upTo(Math.max(0, shuffled.length - 1)).toReversed()) {
        const other = Math.floor(next() * (index + 1));

        [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }

    return shuffled;
}

export function buildJobs(plan: JobPlan): Job[] {
    const questions = plan.questions.filter((question) => plan.lectureIds.includes(question.lectureId));

    const qaJobs = plan.tasks.includes("qa")
        ? plan.conditions.flatMap((condition) =>
              questions.flatMap((question) =>
                  upTo(plan.runs).map((run): Job => ({
                      key: jobKey("qa", question.lectureId, question.id, condition, run),
                      task: "qa",
                      lectureId: question.lectureId,
                      questionId: question.id,
                      condition,
                      run,
                  })),
              ),
          )
        : [];

    const quizJobs = plan.tasks.includes("quiz")
        ? plan.conditions.flatMap((condition) =>
              plan.lectureIds.flatMap((lectureId) =>
                  upTo(plan.quizRuns).map((run): Job => ({
                      key: jobKey("quiz", lectureId, undefined, condition, run),
                      task: "quiz",
                      lectureId,
                      condition,
                      run,
                  })),
              ),
          )
        : [];

    return seededShuffle([...qaJobs, ...quizJobs], plan.seed);
}
