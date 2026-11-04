import { AuthProvider } from "../src/api/auth/provider";
import type { Course } from "../src/api/courses/types";
import type { Lecture } from "../src/api/lectures/types";
import LectureDetail from "../src/components/lectures/lecture-detail";
import LectureList from "../src/components/lectures/lecture-list";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const lecture: Lecture = {
    id: "1",
    title: "Lecture recording",
    description: "A recording with no processed content yet.",
    status: "uploaded",
    statusMessage: "Recording uploaded.",
    resources: [],
    generatedContent: [],
};

function ignore() {}

test("uploaded recordings say processing has not started and only teachers can start it", () => {
    const teacher = renderAuthenticated(<LectureDetail courseId="1" lecture={lecture} role="teacher" onBack={ignore} />);
    const member = renderAuthenticated(<LectureDetail courseId="1" lecture={lecture} role="member" onBack={ignore} />);

    assert.match(teacher, /Recording saved/);
    assert.match(teacher, /Start processing/);
    assert.doesNotMatch(teacher, /Preparing study materials|Study materials are ready/);
    assert.doesNotMatch(member, /Start processing/);
});

test("pending recordings explain that the file has not been uploaded", () => {
    const markup = renderAuthenticated(
        <LectureDetail courseId="1" lecture={{ ...lecture, status: "pending" }} role="member" onBack={ignore} />,
    );

    assert.match(markup, /No recording yet/);
    assert.doesNotMatch(markup, /Preparing study materials|aria-label="Recording"/);
});

test("the uploaded filter excludes pending recordings", () => {
    const course: Course = {
        id: "1",
        code: "CSI 4500",
        name: "Operating Systems",
        description: "Course recordings.",
        role: "member",
        lectures: [lecture, { ...lecture, id: "2", title: "Not uploaded", status: "pending" }],
    };

    const markup = renderAuthenticated(
        <LectureList
            courses={[course]}
            course={course}
            query=""
            status="uploaded"
            onCourseChange={ignore}
            onQueryChange={ignore}
            onStatusChange={ignore}
            onOpenLecture={ignore}
        />,
    );

    assert.match(markup, /Lecture recording/);
    assert.doesNotMatch(markup, /Not uploaded/);
});

function renderAuthenticated(children: ReactNode) {
    return renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
            <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>,
    );
}
