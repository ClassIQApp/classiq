import type { Course } from "./model.ts";

export const courses: Omit<Course, "slug">[] = [
    {
        id: "1",
        code: "CSI 4500",
        name: "Operating Systems",
        description: "Processes, memory, and concurrency.",
        joinCode: "ABC123",
    },
    {
        id: "2",
        code: "MTH 2775",
        name: "Linear Algebra",
        description: "Vector spaces and matrices.",
        joinCode: "XYZ789",
    },
    {
        id: "3",
        code: "CSI 3430",
        name: "Algorithms",
        description: "An empty course before the first lecture.",
        joinCode: "DEF456",
    },
];
