import { createQuizzesApi, quizAttemptQueryKey } from "../src/api/quizzes/client.ts";
import assert from "node:assert/strict";
import test from "node:test";

interface Call {
    path: string;
    method: string;
    body: unknown;
}

function recordingApi(response: unknown) {
    const calls: Call[] = [];
    const api = createQuizzesApi(async (path, init) => {
        calls.push({ path, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });

        return Response.json(response);
    });

    return { api, calls };
}

test("generating for the whole course omits the lecture and a lecture quiz sends it", async () => {
    const { api, calls } = recordingApi({ id: "3" });

    await api.generate("10", undefined, 5);
    await api.generate("10", "4", 8);

    assert.deepEqual(calls, [
        { path: "/courses/10/quizzes", method: "POST", body: { questionCount: 5 } },
        { path: "/courses/10/quizzes", method: "POST", body: { lectureId: "4", questionCount: 8 } },
    ]);
});

test("submitting sends a null choice for unanswered questions and posts to the quiz's attempts", async () => {
    const { api, calls } = recordingApi({ id: "9" });

    await api.submit("10", "3", [
        { questionId: "21", choice: 2 },
        { questionId: "22", choice: null },
    ]);

    assert.deepEqual(calls, [
        {
            path: "/courses/10/quizzes/3/attempts",
            method: "POST",
            body: {
                answers: [
                    { questionId: "21", choice: 2 },
                    { questionId: "22", choice: null },
                ],
            },
        },
    ]);
});

test("attempt results are cached per account so another account never sees them", () => {
    assert.notDeepEqual(quizAttemptQueryKey("1", "10", "3", "9"), quizAttemptQueryKey("2", "10", "3", "9"));
});
