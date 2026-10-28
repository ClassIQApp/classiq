import type { Course } from "../../api/courses/types";
import CourseRoleBadge from "./course-role-badge";

interface CourseCardProps {
    course: Course;
    onOpen: () => void;
    onEditSettings: () => void;
}

export default function CourseCard({ course, onOpen, onEditSettings }: CourseCardProps) {
    return (
        <li className="teacher-course-card">
            <div>
                <span className="teacher-course-code">{course.code}</span>
                <CourseRoleBadge role={course.role} />

                <h3>{course.name}</h3>

                <p className="teacher-course-description">{course.description || "No description added."}</p>
            </div>

            <div className="teacher-course-card-footer">
                <span>
                    {course.lectures.length} {course.lectures.length === 1 ? "lecture" : "lectures"}
                </span>

                <span className="teacher-course-card-actions">
                    {course.role === "teacher" && (
                        <button className="teacher-course-settings-btn" type="button" onClick={onEditSettings}>
                            Course Settings
                        </button>
                    )}

                    <button className="teacher-course-primary-btn" type="button" onClick={onOpen}>
                        Open Course
                    </button>
                </span>
            </div>
        </li>
    );
}
