import "./login.css";
import { useState } from "react";

type LoginProps = {
    onLogin: (email: string, password: string) => void;
};

export default function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        if (!email || !password) {
            return;
        }

        onLogin(email, password);
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <img src="/classiq-logo.png" alt="ClassIQ" className="login-brand-logo" />
                </div>

                <p className="login-subtitle">Sign in to continue to your ClassIQ account.</p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label>
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Enter your email"
                        />
                    </label>

                    <label>
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter your password"
                        />
                    </label>

                    <button className="sign-in-button" type="submit">
                        Sign In
                    </button>
                </form>

                <p className="login-footer">Better understanding. Brighter futures.</p>
            </div>
        </div>
    );
}
