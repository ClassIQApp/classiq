import { ApiError } from "../../api/auth/client";
import { useCourse, useCourses, useForgetUnavailableCourse } from "../../api/courses/use-courses";
import CourseWorkspace from "../../components/courses/course-workspace";
import "../teacher/TeacherCourses.css";
import "./course-resources.css";
import "./courses.css";
import { useEffect } from "react";

interface CoursePageProps {
    courseId: string;
    onCourseChange: (courseId: string) => void;
    onClose: () => void;
}

export default function CoursePage({ courseId, onCourseChange, onClose }: CoursePageProps) {
    const course = useCourse(courseId);
    const courses = useCourses();
    const forgetUnavailableCourse = useForgetUnavailableCourse();

    const unavailable = course.error instanceof ApiError && course.error.status === 404;

    useEffect(() => {
        if (unavailable) {
            forgetUnavailableCourse(courseId);
        }
    }, [unavailable, courseId, forgetUnavailableCourse]);

    if (course.isPending || (course.isError && course.isFetching)) {
        return <p role="status">Loading course…</p>;
    }

    if (unavailable) {
        return (
            <div className="courses-page">
                <div className="teacher-course-error" role="alert">
                    <h1>This course is unavailable</h1>
                    <p>It may have been deleted, or you may no longer have access to it.</p>
                    <button className="teacher-course-primary-btn" type="button" onClick={onClose}>
                        Back to courses
                    </button>
                </div>
            </div>
        );
    }

    if (course.isError) {
        return (
            <div className="courses-page">
                <div className="teacher-course-error" role="alert">
                    <h1>This course could not load</h1>
                    <p>{course.error.message}</p>
                    <button className="teacher-course-primary-btn" type="button" onClick={() => void course.refetch()}>
                        Retry
                    </button>
                    <button className="teacher-course-secondary-btn" type="button" onClick={onClose}>
                        Back to courses
                    </button>
                </div>
            </div>
        );
    }

    const otherCourses = (courses.data ?? []).filter((item) => item.id !== course.data.id);

    return (
        <CourseWorkspace
            key={course.data.id}
            course={course.data}
            courses={[course.data, ...otherCourses]}
            onCourseChange={onCourseChange}
            onClose={onClose}
        />
    );
}
