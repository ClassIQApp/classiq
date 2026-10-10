import CourseResources from "./CourseResources";
import "./Courses.css";
import { useState } from "react";
import React from "react";

export default function StudentCourses() {
    const [showResources, setShowResources] = useState(false);

    return (
        <div className="courses-container">
            <div className="courses-header">
                <h1 className="courses-title">My Courses</h1>
                <button
                    onClick={() => setShowResources(!showResources)}
                    className="resources-toggle-btn"
                    style={{
                        background: showResources ? "var(--color-surface-sunken)" : "var(--color-primary)",
                        color: showResources ? "var(--color-text)" : "var(--color-on-primary)",
                    }}
                >
                    {showResources ? "Back to Courses" : "Resources"}
                </button>
            </div>

            {showResources ? (
                <CourseResources />
            ) : (
                <div>
                    <p className="courses-default-text">Your enrolled classes and lectures will appear here.</p>
                </div>
            )}
        </div>
    );
}
