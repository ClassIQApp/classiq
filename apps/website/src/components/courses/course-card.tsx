import type { Course } from "../../api/courses/types";
import { useTranslation } from "../../i18n/use-translation";
import CourseRoleBadge from "./course-role-badge";
import { GearSixIcon } from "@phosphor-icons/react";

interface CourseCardProps {
    course: Course;
    onOpen: () => void;
    onEditSettings: () => void;
}

export default function CourseCard({ course, onOpen, onEditSettings }: CourseCardProps) {
    const { t } = useTranslation();

    return (
        <li className="teacher-course-card">
            <div>
                <span className="teacher-course-code">{course.code}</span>

                <CourseRoleBadge role={course.role} />

                <h3>{course.name}</h3>

                <p className="teacher-course-description">{course.description || t("courseCard.noDescription")}</p>
            </div>

            <div className="teacher-course-card-footer">
                <span>
                    {course.lectures.length}{" "}
                    {course.lectures.length === 1 ? t("courseCard.lectureSingular") : t("courseCard.lecturePlural")}
                </span>

                <span className="teacher-course-card-actions">
                    {course.role === "teacher" && (
                        <button className="teacher-course-settings-btn" type="button" onClick={onEditSettings}>
                            <GearSixIcon className="button-icon" aria-hidden />

                            {t("courseCard.settings")}
                        </button>
                    )}

                    <button className="teacher-course-primary-btn" type="button" onClick={onOpen}>
                        {t("courseCard.open")}
                    </button>
                </span>
            </div>
        </li>
    );
}
