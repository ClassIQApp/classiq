import type { Lecture } from "../lectures/types";

export interface Course {
    id: string;
    code: string;
    name: string;
    description: string;
    lectures: Lecture[];
}

export interface ListCoursesResponse {
    items: Course[];
}
