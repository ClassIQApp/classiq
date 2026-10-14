import type { Lecture } from "../lecture/model.ts";

export interface Course {
    id: string;
    code: string;
    name: string;
    description: string;
    lectures: Lecture[];
}
