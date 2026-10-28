import { useState } from "react";
import type { ChangeEvent } from "react";

interface ResourceFile {
    name: string;
    url: string;
}

export default function CourseResources({ canManage }: { canManage: boolean }) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [resources, setResources] = useState<ResourceFile[]>([]);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
        }
    }

    function handleUpload() {
        if (!selectedFile) {
            return;
        }

        const fileUrl = URL.createObjectURL(selectedFile);
        setResources([...resources, { name: selectedFile.name, url: fileUrl }]);
        setSelectedFile(null);
    }

    return (
        <div className="resources-container">
            <h2>Course Resources</h2>
            <p className="resources-desc">
                {canManage
                    ? "Upload and view PDF lecture notes, assignments, or study guides."
                    : "View PDF lecture notes, assignments, or study guides."}
            </p>

            {canManage && (
                <div className="resources-card">
                    <label className="resources-label">Select PDF File</label>
                    <input type="file" accept=".pdf" onChange={handleFileChange} className="resources-input" />

                    {selectedFile && (
                        <button onClick={handleUpload} className="resources-btn">
                            Upload {selectedFile.name}
                        </button>
                    )}
                </div>
            )}

            {!canManage && <p>No resources have been shared yet.</p>}

            {resources.length > 0 && (
                <div className="resources-list-section">
                    <h3>Uploaded Resources</h3>
                    <ul className="resources-list">
                        {resources.map((res, index) => (
                            <li key={index} className="resources-item">
                                <span className="resources-file-name">{res.name}</span>
                                <a href={res.url} target="_blank" rel="noopener noreferrer" className="resources-view-btn">
                                    View PDF
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
