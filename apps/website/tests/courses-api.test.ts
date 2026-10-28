import { ApiError, createApiFetch } from "../src/api/auth/client.ts";
import type { AuthApi } from "../src/api/auth/client.ts";
import { SessionController } from "../src/api/auth/session.ts";
import { createCoursesApi } from "../src/api/courses/client.ts";
import type { Course, CourseRegistration } from "../src/api/courses/types.ts";
import {
    courseListQueryKey,
    courseListQueryOptions,
    courseQueryKey,
    courseQueryOptions,
    createCourseMutationOptions,
    forgetUnavailableCourse,
    updateCourseMutationOptions,
} from "../src/api/courses/use-courses.ts";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";

const alice = { id: "1", name: "Alice", email: "alice@example.com" };

const bob = { id: "2", name: "Bob", email: "bob@example.com" };

const taught: Course = { id: "10", code: "CSI 4500", name: "Operating Systems", description: "", role: "teacher", lectures: [] };

const joined: Course = { id: "20", code: "MAT 1300", name: "Calculus", description: "Limits", role: "member", lectures: [] };

const registration: CourseRegistration = { code: "CSI 2100", name: "Data Structures", slug: "csi-2100-data-structures", description: "" };

interface RecordedRequest {
    url: string;
    init?: RequestInit;
}

function courseServer(courses: Course[]) {
    const requests: RecordedRequest[] = [];
    const transport: typeof fetch = async (url, init) => {
        const path = String(url);
        const method = init?.method ?? "GET";
        const course = courses.find((item) => path === `/courses/${item.id}`);

        requests.push({ url: path, init });

        if (path === "/courses" && method === "GET") {
            return Response.json({ items: courses });
        }

        if (path === "/courses" && method === "POST") {
            const body: CourseRegistration = JSON.parse(String(init?.body));

            return Response.json(
                { id: "30", code: body.code, name: body.name, description: body.description, role: "teacher", lectures: [] },
                { status: 201 },
            );
        }

        if (!course) {
            return Response.json({ code: "COURSE_NOT_FOUND", message: "Course was not found." }, { status: 404 });
        }

        if (method === "PATCH" && course.role !== "teacher") {
            return Response.json({ code: "FORBIDDEN", message: "Only the Teacher can change this course." }, { status: 403 });
        }

        if (method === "PATCH") {
            return Response.json({ ...course, ...JSON.parse(String(init?.body)) });
        }

        return Response.json(course);
    };

    return { api: createCoursesApi(createApiFetch("", transport)), requests };
}

test("course requests use the course endpoints with JSON bodies and credentials", async () => {
    const { api, requests } = courseServer([taught, joined]);

    assert.deepEqual(await api.listCourses(), [taught, joined]);
    assert.deepEqual(await api.fetchCourse(joined.id), joined);

    await api.createCourse(registration);
    await api.updateCourse(taught.id, { code: "CSI 4500", name: "Systems", description: "Updated" });

    assert.deepEqual(
        requests.map(({ url, init }) => `${init?.method ?? "GET"} ${url}`),
        ["GET /courses", "GET /courses/20", "POST /courses", "PATCH /courses/10"],
    );
    assert.equal(requests[2]?.init?.body, JSON.stringify(registration));
    assert.equal(requests[3]?.init?.body, JSON.stringify({ code: "CSI 4500", name: "Systems", description: "Updated" }));

    for (const { init } of requests) {
        assert.equal(init?.credentials, "include");
    }
});

test("an account sees its role in each course and an empty list stays empty", async () => {
    const cache = new QueryClient();
    const { api } = courseServer([taught, joined]);
    const empty = courseServer([]);

    const courses = await cache.fetchQuery(courseListQueryOptions(api, alice.id));
    const selected = await cache.fetchQuery(courseQueryOptions(api, alice.id, joined.id));

    assert.deepEqual(
        courses.map(({ id, role }) => ({ id, role })),
        [
            { id: "10", role: "teacher" },
            { id: "20", role: "member" },
        ],
    );
    assert.equal(selected.role, "member");
    assert.deepEqual(cache.getQueryData(courseQueryKey(alice.id, joined.id)), joined);
    assert.deepEqual(await cache.fetchQuery(courseListQueryOptions(empty.api, bob.id)), []);
});

test("a deleted or inaccessible selection fails as not found and leaves the course list", async () => {
    const cache = new QueryClient();
    const { api } = courseServer([taught]);

    cache.setQueryData(courseListQueryKey(alice.id), [taught, joined]);
    cache.setQueryData(courseListQueryKey(bob.id), [joined]);

    await assert.rejects(
        cache.fetchQuery(courseQueryOptions(api, alice.id, joined.id)),
        (error: unknown) => error instanceof ApiError && error.status === 404 && error.code === "COURSE_NOT_FOUND",
    );

    forgetUnavailableCourse(cache, alice.id, joined.id);

    assert.deepEqual(cache.getQueryData(courseListQueryKey(alice.id)), [taught]);
    assert.deepEqual(cache.getQueryData(courseListQueryKey(bob.id)), [joined]);
});

test("creating a course caches it as taught and invalidates only the creator's courses", async () => {
    const cache = new QueryClient();
    const { api } = courseServer([taught]);

    cache.setQueryData(courseListQueryKey(alice.id), [taught]);
    cache.setQueryData(courseListQueryKey(bob.id), [joined]);

    const created = await new MutationObserver(cache, createCourseMutationOptions(api, cache, alice.id)).mutate(registration);

    assert.equal(created.role, "teacher");
    assert.deepEqual(cache.getQueryData(courseQueryKey(alice.id, created.id)), created);
    assert.equal(cache.getQueryState(courseListQueryKey(alice.id))?.isInvalidated, true);
    assert.equal(cache.getQueryState(courseListQueryKey(bob.id))?.isInvalidated, false);
});

test("Teacher settings updates refresh the course; Member updates are rejected and refresh the course role", async () => {
    const cache = new QueryClient();
    const { api } = courseServer([taught, joined]);
    const update = { code: "CSI 4500", name: "Systems", description: "Updated" };

    cache.setQueryData(courseListQueryKey(alice.id), [taught, joined]);
    cache.setQueryData(courseQueryKey(alice.id, joined.id), joined);

    await new MutationObserver(cache, updateCourseMutationOptions(api, cache, alice.id)).mutate({ courseId: taught.id, update });

    assert.equal(cache.getQueryData<Course>(courseQueryKey(alice.id, taught.id))?.name, "Systems");
    assert.equal(cache.getQueryState(courseListQueryKey(alice.id))?.isInvalidated, true);

    await assert.rejects(
        new MutationObserver(cache, updateCourseMutationOptions(api, cache, alice.id)).mutate({ courseId: joined.id, update }),
        (error: unknown) => error instanceof ApiError && error.status === 403 && /Only the Teacher/.test(error.message),
    );
    assert.deepEqual(cache.getQueryData(courseQueryKey(alice.id, joined.id)), joined);
    assert.equal(cache.getQueryState(courseQueryKey(alice.id, joined.id))?.isInvalidated, true);
});

test("logout and account switching discard the selected course and course list", async () => {
    const cache = new QueryClient();
    const auth: AuthApi = {
        getSession: async () => alice,
        signIn: async () => {},
        signUp: async () => {},
        signOut: async () => {},
    };
    const controller = new SessionController(auth, () => {
        void cache.cancelQueries();
        cache.clear();
    });

    await controller.restore();

    cache.setQueryData(courseListQueryKey(alice.id), [taught]);
    cache.setQueryData(courseQueryKey(alice.id, taught.id), taught);

    await controller.logout();

    assert.equal(cache.getQueryData(courseQueryKey(alice.id, taught.id)), undefined);

    auth.getSession = async () => bob;

    cache.setQueryData(courseQueryKey(alice.id, taught.id), taught);

    await controller.authenticate({ email: bob.email, password: "password123" });

    assert.deepEqual(controller.state, { status: "authenticated", user: bob });
    assert.equal(cache.getQueryCache().getAll().length, 0);
});
