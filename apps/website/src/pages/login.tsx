import "./login.css";

type LoginProps = {
    onLogin: (role: "teacher" | "student") => void;
};

export default function Login({ onLogin }: LoginProps) {
    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <div className="login-logo">▣</div>
                    <h1>ClassIQ</h1>
                </div>

                <p className="login-subtitle">Choose how you would like to continue.</p>

                <div className="login-options">
                    <button className="login-button" onClick={() => onLogin("teacher")}>
                        <span className="login-icon">♧</span>

                        <div>
                            <strong>Teacher</strong>
                            <small>Instructor dashboard and live lectures</small>
                        </div>
                    </button>

                    <button className="login-button" onClick={() => onLogin("student")}>
                        <span className="login-icon">□</span>

                        <div>
                            <strong>Student</strong>
                            <small>Courses, lectures, and class materials</small>
                        </div>
                    </button>
                </div>

                <p className="login-footer">Better understanding. Brighter futures.</p>
            </div>
        </div>
    );
}
