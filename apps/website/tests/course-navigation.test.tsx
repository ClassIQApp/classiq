import { AuthProvider } from "../src/api/auth/provider";
import type { Course } from "../src/api/courses/types";
import type { Lecture } from "../src/api/lectures/types";
import { createResourcesApi, resourceQueryKey } from "../src/api/resources/client";
import CourseCard from "../src/components/courses/course-card";
import CourseForm from "../src/components/courses/course-form";
import { ResourceLibrary } from "../src/components/courses/course-resources";
import CourseWorkspace from "../src/components/courses/course-workspace";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const lecture: Lecture = {
    id: "1",
    title: "Scheduling",
    description: "Process scheduling.",
    status: "pending",
    statusMessage: "Awaiting recording upload.",
    resources: [],
    generatedContent: [],
};

const taught: Course = {
    id: "10",
    code: "CSI 4500",
    name: "Operating Systems",
    description: "Kernels and processes.",
    role: "teacher",
    lectures: [lecture],
};

const joined: Course = { id: "20", code: "MAT 1300", name: "Calculus", description: "", role: "member", lectures: [] };

function ignore() {}

test("course cards show each role and offer settings only to the Teacher", () => {
    const teacherMarkup = renderToStaticMarkup(<CourseCard course={taught} onOpen={ignore} onEditSettings={ignore} />);
    const memberMarkup = renderToStaticMarkup(<CourseCard course={joined} onOpen={ignore} onEditSettings={ignore} />);

    assert.match(teacherMarkup, /course-role-teacher">Teacher</);
    assert.match(teacherMarkup, /Course Settings/);
    assert.match(teacherMarkup, /Open Course/);

    assert.match(memberMarkup, /course-role-member">Member</);
    assert.doesNotMatch(memberMarkup, /Course Settings/);
    assert.match(memberMarkup, /Open Course/);
    assert.match(memberMarkup, /No description added/);
});

test("switching from a taught course to a joined course keeps navigation and removes upload controls", () => {
    const render = (course: Course) =>
        renderToStaticMarkup(
            <QueryClientProvider client={new QueryClient()}>
                <AuthProvider>
                    <CourseWorkspace course={course} courses={[taught, joined]} onCourseChange={ignore} onClose={ignore} />
                </AuthProvider>
            </QueryClientProvider>,
        );
    const teacherMarkup = render(taught);
    const memberMarkup = render(joined);

    assert.match(teacherMarkup, /<h1[^>]*>Operating Systems<\/h1>/);
    assert.match(teacherMarkup, />Teacher</);
    assert.match(teacherMarkup, /Scheduling/);
    assert.match(teacherMarkup, /aria-current="page"[^>]*>Lectures</);

    assert.match(memberMarkup, /<h1[^>]*>Calculus<\/h1>/);
    assert.match(memberMarkup, />Member</);
    assert.doesNotMatch(memberMarkup, /Scheduling|Operating Systems<\/h1>/);
    assert.match(memberMarkup, /<option value="10">CSI 4500 · Operating Systems<\/option>/);
});

test("Members can view resources but cannot select files to upload", () => {
    const client = new QueryClient();
    const api = createResourcesApi(async () => Response.json({ items: [] }));
    client.setQueryData(resourceQueryKey("account", "10"), []);
    const render = (canManage: boolean) =>
        renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <ResourceLibrary courseId="10" lectures={[]} canManage={canManage} accountId="account" api={api} />
            </QueryClientProvider>,
        );
    const teacherMarkup = render(true);
    const memberMarkup = render(false);

    assert.match(teacherMarkup, /type="file"/);
    assert.doesNotMatch(memberMarkup, /type="file"|Upload/);
    assert.match(memberMarkup, /No resources have been shared yet/);
});

test("the course form submits from the keyboard and requires a nonblank code and name", () => {
    const markup = renderToStaticMarkup(
        <CourseForm
            eyebrow="Course Settings"
            title="Operating Systems"
            description="Update the course."
            initialValues={taught}
            submitLabel="Save Changes"
            pendingLabel="Saving…"
            pending={false}
            error="A course with this code and name already exists."
            onSubmit={ignore}
            onCancel={ignore}
        />,
    );

    assert.match(markup, /<form class="teacher-course-form"/);
    assert.match(markup, /<button class="teacher-course-primary-btn" type="submit">Save Changes<\/button>/);
    assert.match(markup, /<button class="teacher-course-secondary-btn" type="button">Cancel<\/button>/);
    assert.match(markup, /<label>Course Code<input[^>]*required=""[^>]*name="code"/);
    assert.match(markup, /<label>Course Name<input[^>]*required=""[^>]*name="name"/);
    assert.match(markup, /pattern="\.\*\\S\.\*"/);
    assert.match(markup, /value="CSI 4500"/);
    assert.match(markup, /role="alert">A course with this code and name already exists/);
});

test("a pending course form disables its fields and actions", () => {
    const markup = renderToStaticMarkup(
        <CourseForm
            eyebrow="New Course"
            title="Create Course"
            description="Create a course."
            initialValues={{ code: "", name: "", description: "" }}
            submitLabel="Create Course"
            pendingLabel="Creating…"
            pending
            error={null}
            onSubmit={ignore}
            onCancel={ignore}
        />,
    );

    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, /type="submit" disabled="">Creating…/);
    assert.equal(markup.match(/disabled=""/g)?.length, 5);
    assert.doesNotMatch(markup, /role="alert"/);
});

test("the persisted resource list exposes only completed downloads and explains incomplete files", () => {
    const client = new QueryClient();
    const api = createResourcesApi(async () => Response.json({ items: [] }));
    client.setQueryData(resourceQueryKey("account", "10"), [
        { id: "1", name: "Ready.pdf", contentLength: 1024, uploadStatus: "uploaded" },
        { id: "2", name: "Pending.pdf", contentLength: 2048, uploadStatus: "pending" },
        { id: "3", name: "Failed.pdf", contentLength: 1024, uploadStatus: "failed" },
    ]);
    const markup = renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <ResourceLibrary courseId="10" lectures={[]} canManage={false} accountId="account" api={api} />
        </QueryClientProvider>,
    );

    assert.match(markup, /Ready.pdf/);
    assert.match(markup, /Awaiting upload verification/);
    assert.match(markup, /Upload failed/);
    assert.equal(markup.match(/Open \/ download PDF/g)?.length, 1);
    assert.doesNotMatch(markup, /type="file"|blob:/);
});
