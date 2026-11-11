import type { CourseRole } from "../../api/courses/types";
import { useTranslation } from "../../i18n/use-translation";

export default function CourseRoleBadge({ role }: { role: CourseRole }) {
    const { t } = useTranslation();

    const labelByRole: Record<CourseRole, string> = {
        teacher: t("courseRole.teacher"),
        member: t("courseRole.member"),
    };

    return <span className={`course-role-badge course-role-${role}`}>{labelByRole[role]}</span>;
}
