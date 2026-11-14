import type { Course } from "../../api/courses/types";
import { useTranslation } from "../../i18n/use-translation";
import CourseRoleBadge from "./course-role-badge";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GearSixIcon } from "@phosphor-icons/react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

function stopPointerDrag(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
}

function stopKeyboardDrag(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
}

interface CourseCardProps {
    course: Course;
    onOpen: () => void;
    onEditSettings: () => void;
}

export default function CourseCard({ course, onOpen, onEditSettings }: CourseCardProps) {
    const { t } = useTranslation();

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: course.id,
    });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        cursor: isDragging ? "grabbing" : "grab",
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <li ref={setNodeRef} className="teacher-course-card" style={style} {...attributes} {...listeners}>
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

                <span className="teacher-course-card-actions" onPointerDown={stopPointerDrag} onKeyDown={stopKeyboardDrag}>
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
