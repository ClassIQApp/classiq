import "./CourseResources.css";
import { useState } from "react";
import React from "react";

interface ResourceFile {
    name: string;
    url: string;
}

export default function CourseResources() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [resources, setResources] = useState<ResourceFile[]>([]);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    }

    function handleUpload() {
        if (!selectedFile) return;

        //temporary local URL so the PDF can be viewed in the browser
        const fileUrl = URL.createObjectURL(selectedFile);
        setResources([...resources, { name: selectedFile.name, url: fileUrl }]);
        setSelectedFile(null);
    }

    return (
        <div className="resources-container">
            <h2>Course Resources</h2>
            <p className="resources-desc">Upload and view PDF lecture notes, assignments, or study guides.</p>

            <div className="resources-card">
                <label className="resources-label">Select PDF File</label>
                <input type="file" accept=".pdf" onChange={handleFileChange} className="resources-input" />

                {selectedFile && (
                    <button onClick={handleUpload} className="resources-btn">
                        Upload {selectedFile.name}
                    </button>
                )}
            </div>

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
