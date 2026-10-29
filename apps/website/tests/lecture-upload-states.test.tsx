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

test("uploaded recordings do not claim processing or generated content is ready", () => {
    const markup = renderAuthenticated(<LectureDetail courseId="1" lecture={lecture} onBack={ignore} />);

    assert.match(markup, /Recording uploaded/);
    assert.match(markup, /No content has been added yet/);
    assert.doesNotMatch(markup, /Preparing your lecture|Ready to review/);
});

test("pending recordings explain that the file has not been uploaded", () => {
    const markup = renderAuthenticated(<LectureDetail courseId="1" lecture={{ ...lecture, status: "pending" }} onBack={ignore} />);

    assert.match(markup, /Awaiting recording upload/);
    assert.doesNotMatch(markup, /Preparing your lecture|Ready to review/);
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
