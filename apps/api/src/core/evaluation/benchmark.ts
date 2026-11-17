import * as z from "zod/mini";

const name = z.string().check(z.trim(), z.minLength(1));

export const conditionSchema = z.enum(["A", "B", "C"]);
export const categorySchema = z.enum(["lecture", "document", "unanswerable"]);

export const benchmarkSchema = z.strictObject({
    config: z.strictObject({
        contextChars: z._default(z.int().check(z.positive()), 48_000),
        passageLimit: z._default(z.int().check(z.minimum(1), z.maximum(50)), 40),
        runs: z._default(z.int().check(z.positive()), 2),
        quizRuns: z._default(z.int().check(z.positive()), 2),
        quizQuestions: z._default(z.int().check(z.minimum(3), z.maximum(15)), 5),
        seed: z._default(z.int(), 1),
        pricing: z.optional(z.strictObject({ inputPerMillion: z.number(), outputPerMillion: z.number() })),
    }),
    lectures: z.array(
        z.strictObject({
            id: name,
            title: name,
            topic: name,
            transcript: name,
            documents: z._default(z.array(z.strictObject({ title: name, pages: name })), []),
            wer: z.optional(
                z.strictObject({
                    reference: name,
                    startSeconds: z.number().check(z.minimum(0)),
                    endSeconds: z.number().check(z.positive()),
                }),
            ),
        }),
    ),
    questions: z.array(z.strictObject({ id: name, lectureId: name, category: categorySchema, question: name, reference: name })),
});

export type Benchmark = z.infer<typeof benchmarkSchema>;
export type BenchmarkLecture = Benchmark["lectures"][number];
export type BenchmarkQuestion = Benchmark["questions"][number];
