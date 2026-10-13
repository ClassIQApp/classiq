import type { Lecture } from "./model.ts";

export const lecturesByCourseId: Record<string, Lecture[]> = {
    "1": [
        {
            id: "1",
            title: "CPU scheduling",
            description: "How schedulers balance responsiveness and throughput.",
            status: "ready",
            statusMessage: "Transcript and learning resources are available.",
            transcript: {
                id: "1",
                title: "Scheduling transcript",
                description: "Timestamped transcript with speaker labels.",
                href: "#transcript-1",
            },
            resources: [
                {
                    id: "1",
                    title: "Process scheduling slides",
                    description: "Examples from the lecture.",
                    href: "#resource-1",
                },
            ],
            generatedContent: [
                {
                    id: "1",
                    title: "Scheduling summary",
                    description:
                        "Scheduling balances responsiveness, throughput, and fairness. Round-robin rotates runnable processes through a fixed time slice.",
                    href: "#generated-1",
                },
                {
                    id: "2",
                    title: "Key terminology",
                    description: "Time slice; context switch; runnable process; throughput; fairness.",
                    href: "#generated-2",
                },
            ],
        },
        {
            id: "2",
            title: "Virtual memory",
            description: "Address spaces, page tables, and page faults.",
            status: "processing",
            statusMessage: "Transcription is running.",
            resources: [],
            generatedContent: [],
        },
        {
            id: "3",
            title: "Synchronization",
            description: "Locks, semaphores, and concurrent access.",
            status: "failed",
            statusMessage: "The recording could not be decoded. Upload a supported recording to retry.",
            resources: [],
            generatedContent: [],
        },
    ],
    "2": [
        {
            id: "4",
            title: "Vector spaces",
            description: "Bases and linear independence.",
            status: "ready",
            statusMessage: "Ready",
            resources: [
                {
                    id: "2",
                    title: "Linear algebra notes",
                    description: "Vectors and matrices.",
                    href: "#resource-2",
                },
            ],
            generatedContent: [],
        },
    ],
    "3": [],
};
