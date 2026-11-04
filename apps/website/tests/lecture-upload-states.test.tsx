import { AuthProvider } from "../src/api/auth/provider";
import type { Course } from "../src/api/courses/types";
import type { Lecture } from "../src/api/lectures/types";
import LectureDetail from "../src/components/lectures/lecture-detail";
import LectureList from "../src/components/lectures/lecture-list";
import type { LectureSort } from "../src/components/lectures/lecture-list";
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
            sort="newest"
            onCourseChange={ignore}
            onQueryChange={ignore}
            onStatusChange={ignore}
            onSortChange={ignore}
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

test("only teachers are offered lecture editing", () => {
    const teacher = renderAuthenticated(<LectureDetail courseId="1" lecture={lecture} canManage onBack={ignore} />);
    const member = renderAuthenticated(<LectureDetail courseId="1" lecture={lecture} onBack={ignore} />);

    assert.match(teacher, /Edit lecture/);
    assert.doesNotMatch(member, /Edit lecture/);
});

test("lecture sorting preserves the source list and works with search and status filters", () => {
    const course: Course = {
        id: "1",
        code: "CSI 4500",
        name: "Operating Systems",
        description: "Course recordings.",
        role: "member",
        lectures: [
            { ...lecture, id: "2", title: "Lecture 10" },
            { ...lecture, id: "10", title: "lecture 2" },
            { ...lecture, id: "11", title: "Pending lecture", status: "pending" },
        ],
    };
    const sourceIds = course.lectures.map((item) => item.id);
    const render = (sort: LectureSort, query = "", status: Lecture["status"] | "all" = "all") =>
        renderAuthenticated(
            <LectureList
                courses={[course]}
                course={course}
                query={query}
                status={status}
                sort={sort}
                onCourseChange={ignore}
                onQueryChange={ignore}
                onStatusChange={ignore}
                onSortChange={ignore}
                onOpenLecture={ignore}
            />,
        );
    const titles = (markup: string) => [...markup.matchAll(/class="lecture-card-title">([^<]+)</g)].map((match) => match[1]);

    assert.deepEqual(titles(render("newest")), ["Pending lecture", "lecture 2", "Lecture 10"]);
    assert.deepEqual(titles(render("oldest")), ["Lecture 10", "lecture 2", "Pending lecture"]);
    assert.deepEqual(titles(render("title")), ["lecture 2", "Lecture 10", "Pending lecture"]);
    assert.deepEqual(titles(render("title", "lecture", "uploaded")), ["lecture 2", "Lecture 10"]);
    assert.deepEqual(titles(render("title", "missing")), []);
    assert.deepEqual(
        course.lectures.map((item) => item.id),
        sourceIds,
    );
});
