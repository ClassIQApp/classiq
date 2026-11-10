import "./settings-page.css";

interface SettingsPageProps {
    onOpenAccount: () => void;
    onOpenAccessibility: () => void;
}

export default function SettingsPage({ onOpenAccount, onOpenAccessibility }: SettingsPageProps) {
    return (
        <section className="settings-page">
            <header className="settings-heading">
                <h1>Settings</h1>

                <p>Manage your account and ClassIQ preferences.</p>
            </header>

            <div className="settings-options">
                <button type="button" className="settings-option" onClick={onOpenAccount}>
                    <div className="settings-option-content">
                        <div className="settings-option-icon" aria-hidden="true">
                            <span>👤</span>
                        </div>

                        <div className="settings-option-text">
                            <h2>Account Settings</h2>

                            <p>Manage your name, email, password, and account security.</p>
                        </div>
                    </div>

                    <span className="settings-option-arrow" aria-hidden="true">
                        ›
                    </span>
                </button>

                <button type="button" className="settings-option" onClick={onOpenAccessibility}>
                    <div className="settings-option-content">
                        <div className="settings-option-icon" aria-hidden="true">
                            <span>♿</span>
                        </div>

                        <div className="settings-option-text">
                            <h2>Accessibility</h2>

                            <p>Adjust text size, captions, playback, and interface preferences.</p>
                        </div>
                    </div>

                    <span className="settings-option-arrow" aria-hidden="true">
                        ›
                    </span>
                </button>
            </div>
        </section>
    );
}
