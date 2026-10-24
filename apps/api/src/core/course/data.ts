import type { Course } from "./model.ts";

export const courses: Omit<Course, "slug">[] = [
    {
        id: "1",
        code: "CSI 4500",
        name: "Operating Systems",
        description: "Processes, memory, and concurrency.",
    },
    {
        id: "2",
        code: "MTH 2775",
        name: "Linear Algebra",
        description: "Vectors, matrices, and linear transformations.",
    },
    {
        id: "3",
        code: "CSI 4999",
        name: "Senior Project",
        description: "An empty course before the first lecture.",
    },
];
