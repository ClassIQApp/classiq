import React, { useEffect, useState } from "react";
import "./styles.css";

const API = "http://localhost:4000";

type Material = {
    id: number;
    name: string;
    original_name: string;
    created_at: string;
};

type NavItem = "Live Lecture" | "Courses" | "Materials" | "Settings";

function App() {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [recording, setRecording] = useState(false);
    const [activeNav, setActiveNav] = useState<NavItem>("Live Lecture");

    const [transcript, setTranscript] = useState("");

    const [topic, setTopic] = useState("");

    const [explanation, setExplanation] = useState("");

    const [lectureTime, setLectureTime] = useState("00:00:00");

    /*
     * ---------------------------------------------------------
     * LOAD MATERIALS
     * ---------------------------------------------------------
     */

    async function loadMaterials() {
        try {
            const response = await fetch(`${API}/materials`);

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            setMaterials(data);
        } catch {
            console.log("API is not available yet.");
        }
    }

    useEffect(() => {
        loadMaterials();
    }, []);

    /*
     * ---------------------------------------------------------
     * UPLOAD MATERIAL
     * ---------------------------------------------------------
     */

    async function uploadMaterial(file: File) {
        const formData = new FormData();

        formData.append("file", file);

        try {
            const response = await fetch(`${API}/materials`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                alert("The material could not be uploaded.");
                return;
            }

            await loadMaterials();
        } catch {
            alert(
                "The API server is not running. Make sure the backend is running on port 4000."
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * START / STOP LECTURE
     * ---------------------------------------------------------
     */

    function toggleLecture() {
        const nextState = !recording;

        setRecording(nextState);

        if (nextState) {
            setLectureTime("00:12:34");

            setTranscript(
                "Today we're going to discuss SQL injection, which is one of the most common attacks we see in web applications."
            );

            setTopic("SQL Injection");

            setExplanation(
                "SQL injection is an attack where harmful input is used to manipulate a database query. The uploaded lecture materials can give students additional context about how the attack works and how developers can prevent it."
            );
        } else {
            setTranscript(
                "The lecture is paused. Start the lecture to continue the transcript."
            );

            setTopic("Lecture paused");

            setExplanation(
                "The AI assistant will continue analyzing the lecture when the lecture session is started again."
            );
        }
    }

    const displayedMaterials = materials.map((material) => ({
        id: material.id,
        name: material.original_name,
        uploaded: true,
    }));

    return (
        <div className="app-shell">

            {/*SIDEBAR*/}

            <aside className="sidebar">

                <div className="brand">

                    <div className="brand-mark">
                        <span>▣</span>
                    </div>

                    <div>
                        <div className="brand-title">
                            ClassIQ
                        </div>
                    </div>

                </div>


                <nav className="side-nav">

                    <button
                        className={`nav-item ${activeNav === "Live Lecture" ? "active" : ""
                            }`}
                        onClick={() => setActiveNav("Live Lecture")}
                    >
                        <span className="nav-icon">▷</span>
                        <span>Live Lecture</span>
                    </button>


                    <button
                        className={`nav-item ${activeNav === "Courses" ? "active" : ""
                            }`}
                        onClick={() => setActiveNav("Courses")}
                    >
                        <span className="nav-icon">□</span>
                        <span>Courses</span>
                    </button>


                    <button
                        className={`nav-item ${activeNav === "Materials" ? "active" : ""
                            }`}
                        onClick={() => setActiveNav("Materials")}
                    >
                        <span className="nav-icon">▤</span>
                        <span>Materials</span>
                    </button>


                    <button
                        className={`nav-item ${activeNav === "Settings" ? "active" : ""
                            }`}
                        onClick={() => setActiveNav("Settings")}
                    >
                        <span className="nav-icon">⚙</span>
                        <span>Settings</span>
                    </button>

                </nav>


                <div className="sidebar-footer">

                    <div className="sidebar-rule" />

                    <p>Better understanding.</p>
                    <p>Brighter futures.</p>

                </div>

            </aside>


            {/*MAIN APPLICATION */}

            <div className="main-shell">


                {/*HEADER*/}

                <header className="main-header">


                    <div className="header-right">

                        <button className="instructor-button">
                            ♧ &nbsp; Instructor Mode
                        </button>

                        <div className="header-divider" />

                        <div className="profile">

                        </div>

                    </div>

                </header>


                {/*DASHBOARD */}

                <main className="dashboard">

                    {activeNav === "Live Lecture" && (

                        <>


                            <section className="lecture-stage">

                                <div className="lecture-stage-top">

                                    <div className="live-label">

                                        <span
                                            className={`live-dot ${recording ? "on" : ""
                                                }`}
                                        />

                                        {recording ? "LIVE" : "READY"}

                                    </div>


                                    <div className="transcript-status">

                                        <span className="status-dot" />

                                        Transcript Ready

                                    </div>

                                </div>


                                <div className="stage-content">

                                    <h1>
                                        {topic || "No lecture selected"}
                                    </h1>

                                    <div className="stage-meta">

                                        {topic
                                            ? `Lecture session • ${lectureTime}`
                                            : "Select a course and lecture to begin"}

                                    </div>

                                </div>


                                <div className="waveform">

                                    {Array.from({ length: 34 }).map(
                                        (_, index) => (

                                            <span
                                                key={index}
                                                style={{
                                                    height: `${8 + ((index * 17) % 29)
                                                        }px`,
                                                }}
                                            />

                                        )
                                    )}

                                </div>

                            </section>


                            <section className="content-grid">


                                <div className="transcript-card card">


                                    <div className="tabs">

                                        <button className="tab active">
                                            Live Transcript
                                        </button>

                                        <button className="tab">
                                            Lecture Notes
                                        </button>

                                    </div>


                                    <article className="transcript-entry current">

                                        <div className="timestamp">
                                            00:11
                                        </div>

                                        <div>

                                            <strong>
                                                Professor
                                            </strong>

                                            <p>
                                                {transcript}
                                            </p>

                                        </div>

                                    </article>


                                   

                                    <div className="lecture-controls">


                                        <button
                                            className={`control-button ${recording ? "pause" : "start-control"
                                                }`}
                                            onClick={toggleLecture}
                                        >

                                            {recording
                                                ? "Ⅱ  Pause"
                                                : "▷  Start Lecture"}

                                        </button>


                                        <div className="control-status">

                                            <span
                                                className={
                                                    recording
                                                        ? "control-live-dot"
                                                        : "control-gray-dot"
                                                }
                                            />

                                            {recording
                                                ? "Lecture in progress"
                                                : "Lecture Ready"}

                                        </div>


                                        <div className="lecture-time">

                                            ◷ &nbsp;

                                            {lectureTime}

                                        </div>

                                    </div>

                                </div>


                                <aside className="right-column">


                                    {/*AI INSIGHTS */}

                                    <div className="card ai-card">


                                        <div className="card-heading">

                                            <div className="heading-icon">
                                                ✦
                                            </div>

                                            <h2>
                                                AI Insights
                                            </h2>

                                        </div>


                                        {/* CURRENT TOPIC */}

                                        <div className="insight-section">

                                            <span className="section-label">
                                                CURRENT TOPIC
                                            </span>

                                            <div className="topic-pill">
                                                {topic}
                                            </div>

                                        </div>


                                        {/* SIMPLE EXPLANATION */}

                                        <div className="insight-section">

                                            <span className="section-label">
                                                SIMPLE EXPLANATION
                                            </span>

                                            <p>
                                                {explanation}
                                            </p>

                                        </div>


                                        


                                        {/* RELATED MATERIAL */}

                                        <div className="insight-section last">

                                            <span className="section-label">
                                                RELATED MATERIAL
                                            </span>


                                            <button className="material-link">

                                                <span>
                                                    ▤
                                                </span>

                                                <div>

                                                </div>

                                                <span>
                                                    ›
                                                </span>

                                            </button>

                                        </div>

                                    </div>


                                    {/*CLASS MATERIALS */}

                                    <div className="card materials-card">


                                        <div className="card-heading materials-heading">


                                            <div className="heading-line">

                                                <span>
                                                    ▤
                                                </span>

                                                <h2>
                                                    Related Class Materials
                                                </h2>

                                            </div>


                                            <label className="upload-button">

                                                <input
                                                    type="file"
                                                    accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                                                    onChange={(event) => {

                                                        const file =
                                                            event.target.files?.[0];

                                                        if (file) {
                                                            uploadMaterial(file);
                                                        }

                                                        event.currentTarget.value =
                                                            "";

                                                    }}
                                                />

                                                ↑ Upload

                                            </label>

                                        </div>


                                        <div className="materials-list">

                                            {displayedMaterials.map(
                                                (material) => (

                                                    <button
                                                        className="material-row"
                                                        key={material.id}
                                                    >

                                                        <div className="material-icon">
                                                            ▤
                                                        </div>


                                                        <div className="material-info">

                                                            <strong>
                                                                {material.name}
                                                            </strong>

                                                            <small>
                                                                {material.uploaded
                                                                    ? "Uploaded material"
                                                                    : "Course material"}
                                                            </small>

                                                        </div>


                                                        <span>
                                                            ›
                                                        </span>

                                                    </button>

                                                )
                                            )}

                                        </div>

                                    </div>

                                </aside>

                            </section>

                        </>

                    )}


                    {/*MATERIALS PAGE */}

                    {activeNav === "Materials" && (

                        <section className="page-card card">

                            <div className="section-label">
                                COURSE LIBRARY
                            </div>

                            <h1>
                                Course Materials
                            </h1>

                            <p className="page-description">
                                Upload lecture slides, notes, readings,
                                study guides, and other course resources.
                                The AI assistant will use these materials
                                to provide better explanations during the
                                lecture.
                            </p>


                            <label className="large-upload-button">

                                <input
                                    type="file"
                                    accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                                    onChange={(event) => {

                                        const file =
                                            event.target.files?.[0];

                                        if (file) {
                                            uploadMaterial(file);
                                        }

                                        event.currentTarget.value = "";

                                    }}
                                />

                                ↑ &nbsp; Upload Material

                            </label>


                            <div className="library-grid">

                                {displayedMaterials.map(
                                    (material) => (

                                        <div
                                            className="library-item"
                                            key={material.id}
                                        >

                                            <div className="library-icon">
                                                ▤
                                            </div>

                                            <div>

                                                <strong>
                                                    {material.name}
                                                </strong>

                                                <p>
                                                    {material.uploaded
                                                        ? "Uploaded material"
                                                        : "Course material"}
                                                </p>

                                            </div>

                                        </div>

                                    )
                                )}

                            </div>

                        </section>

                    )}


                    {/*COURSES PAGE*/}
                    {activeNav === "Courses" && (

                        <section className="page-card card">

                            <div className="section-label">
                                COURSES
                            </div>

                            <h1>
                                Courses
                            </h1>

                            <p className="page-description">
                                Your courses and lecture sessions will appear here.
                            </p>

                            <div className="course-preview">

                                <div className="course-preview-icon">
                                    +
                                </div>

                                <div>
                                    <strong>
                                        No courses added yet
                                    </strong>

                                    <p>
                                        Add a course to get started.
                                    </p>
                                </div>

                            </div>

                        </section>

                    )}


                    {/*SETTINGS PAGE */}

                    {activeNav === "Settings" && (

                        <section className="page-card card">

                            <div className="section-label">
                                PREFERENCES
                            </div>

                            <h1>
                                Settings
                            </h1>

                            <p className="page-description">
                                Configure lecture preferences, AI
                                assistance, captions, and account settings.
                            </p>


                            <div className="settings-list">

                                <div className="setting-row">

                                    <div>
                                        <strong>
                                            AI Assistance
                                        </strong>

                                        <p>
                                            Use uploaded course material when
                                            generating explanations.
                                        </p>
                                    </div>

                                    <span className="setting-status">
                                        Enabled
                                    </span>

                                </div>


                                <div className="setting-row">

                                    <div>
                                        <strong>
                                            Lecture Transcript
                                        </strong>

                                        <p>
                                            Display the prepared lecture
                                            transcript during class.
                                        </p>
                                    </div>

                                    <span className="setting-status">
                                        Enabled
                                    </span>

                                </div>

                            </div>

                        </section>

                    )}

                </main>

            </div>

        </div>
    );
}

export default App;