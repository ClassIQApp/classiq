import type { Course } from "../src/api/courses/types";
import type { Lecture } from "../src/api/lectures/types";
import LectureDetail from "../src/components/lectures/lecture-detail";
import LectureList from "../src/components/lectures/lecture-list";
import assert from "node:assert/strict";
import test from "node:test";
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
    const markup = renderToStaticMarkup(<LectureDetail lecture={lecture} onBack={ignore} />);

    assert.match(markup, /Recording uploaded/);
    assert.match(markup, /No content has been added yet/);
    assert.doesNotMatch(markup, /Preparing your lecture|Ready to review/);
});

test("pending recordings explain that the file has not been uploaded", () => {
    const markup = renderToStaticMarkup(<LectureDetail lecture={{ ...lecture, status: "pending" }} onBack={ignore} />);

    assert.match(markup, /Awaiting recording upload/);
    assert.doesNotMatch(markup, /Preparing your lecture|Ready to review/);
});

test("the uploaded filter excludes pending recordings", () => {
    const course: Course = {
        id: "1",
        code: "CSI 4500",
        name: "Operating Systems",
        description: "Course recordings.",
        lectures: [lecture, { ...lecture, id: "2", title: "Not uploaded", status: "pending" }],
    };

    const markup = renderToStaticMarkup(
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
