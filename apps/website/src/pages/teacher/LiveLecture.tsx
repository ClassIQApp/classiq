import { useAuth } from "../../api/auth/provider";
import { completeRecordingUpload, createRecordingUpload, uploadRecordingFile } from "../../api/lectures/recording-upload";
import { useState } from "react";

const supportedTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]);

const maxFileSize = 500 * 1024 ** 2;

export default function LiveLecture() {
    const { apiFetch } = useAuth();

    const [courseId, setCourseId] = useState("");
    const [lectureId, setLectureId] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");

    function chooseFile(selected: File | null) {
        setStatus("idle");
        setMessage("");
        setProgress(0);

        if (!selected) {
            setFile(null);

            return;
        }

        if (!supportedTypes.has(selected.type)) {
            setFile(null);
            setStatus("error");
            setMessage("Please choose a supported audio or video recording.");

            return;
        }

        if (selected.size > maxFileSize) {
            setFile(null);
            setStatus("error");
            setMessage("Recording must be 500 MB or smaller.");

            return;
        }

        setFile(selected);
    }

    async function handleUpload() {
        if (!file || !courseId || !lectureId) {
            setStatus("error");
            setMessage("Choose a course, lecture, and recording first.");

            return;
        }

        try {
            setStatus("uploading");
            setMessage("");
            setProgress(0);

            const ticket = await createRecordingUpload(apiFetch, courseId, lectureId, file);

            await uploadRecordingFile(ticket, file, setProgress);

            await completeRecordingUpload(apiFetch, courseId, lectureId, ticket.uploadId);

            setStatus("success");
            setMessage("Recording uploaded successfully.");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "Recording upload failed.");
        }
    }

    return (
        <div>
            <h1>Lecture Recording</h1>

            <p>Upload a recording for a lecture.</p>

            <label>
                Course ID
                <input
                    type="text"
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                    disabled={status === "uploading"}
                />
            </label>

            <label>
                Lecture ID
                <input
                    type="text"
                    value={lectureId}
                    onChange={(event) => setLectureId(event.target.value)}
                    disabled={status === "uploading"}
                />
            </label>

            <label>
                Recording
                <input
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,video/mp4,video/webm"
                    onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    disabled={status === "uploading"}
                />
            </label>

            {file && (
                <p>
                    Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
            )}

            {status === "uploading" && (
                <div>
                    <progress value={progress} max={100} />
                    <p>{progress}% uploaded</p>
                </div>
            )}

            {message && <p role={status === "error" ? "alert" : "status"}>{message}</p>}

            <button type="button" onClick={() => void handleUpload()} disabled={!file || status === "uploading"}>
                {status === "uploading" ? "Uploading..." : "Upload Recording"}
            </button>
        </div>
    );
}
