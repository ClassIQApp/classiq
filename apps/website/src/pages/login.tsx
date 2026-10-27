import type { Credentials, Registration } from "../api/auth/client";
import "./login.css";
import { useState } from "react";
import type { FormEvent } from "react";

type LoginProps = {
    onAuthenticate: (input: Credentials | Registration) => Promise<void>;
};

export default function Login({ onAuthenticate }: LoginProps) {
    const [register, setRegister] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const actionLabel = register ? "Create Account" : "Sign In";
    const pendingLabel = register ? "Creating account…" : "Signing in…";

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (pending) {
            return;
        }

        setPending(true);
        setError(null);

        try {
            const credentials = { email: email.trim(), password };

            await onAuthenticate(register ? { ...credentials, name: name.trim() } : credentials);

            setPassword("");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <img src="/classiq-logo.png" alt="ClassIQ" className="login-brand-logo" />
                </div>
                <h1 className="login-heading">{register ? "Create your account" : "Welcome back"}</h1>
                <p className="login-subtitle">
                    {register ? "Start learning with ClassIQ." : "Sign in to continue to your ClassIQ account."}
                </p>
                <form className="login-form" onSubmit={handleSubmit} aria-busy={pending}>
                    {register && (
                        <label>
                            Name
                            <input
                                name="name"
                                autoComplete="name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                pattern=".*\S.*"
                                disabled={pending}
                            />
                        </label>
                    )}
                    <label>
                        Email
                        <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Enter your email"
                            required
                            disabled={pending}
                        />
                    </label>
                    <label>
                        Password
                        <input
                            name="password"
                            type="password"
                            autoComplete={register ? "new-password" : "current-password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter your password"
                            minLength={8}
                            maxLength={128}
                            required
                            disabled={pending}
                            aria-describedby={register ? "password-hint" : undefined}
                        />
                    </label>
                    {register && (
                        <p className="login-hint" id="password-hint">
                            Use 8–128 characters.
                        </p>
                    )}
                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}
                    <button className="sign-in-button" type="submit" disabled={pending}>
                        {pending ? pendingLabel : actionLabel}
                    </button>
                </form>
                <button
                    className="login-switch"
                    type="button"
                    disabled={pending}
                    onClick={() => {
                        setRegister(!register);
                        setPassword("");
                        setError(null);
                    }}
                >
                    {register ? "Already have an account? Sign in" : "New to ClassIQ? Create an account"}
                </button>
                <p className="login-footer">Better understanding. Brighter futures.</p>
            </div>
        </div>
    );
}
