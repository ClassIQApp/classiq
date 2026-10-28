import type { CourseRole } from "../../api/courses/types";

const labelByRole: Record<CourseRole, string> = {
    teacher: "Teacher",
    member: "Member",
};

export default function CourseRoleBadge({ role }: { role: CourseRole }) {
    return <span className={`course-role-badge course-role-${role}`}>{labelByRole[role]}</span>;
}
