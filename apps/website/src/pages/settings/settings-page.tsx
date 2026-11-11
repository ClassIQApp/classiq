import { useTranslation } from "../../i18n/use-translation";
import "./settings-page.css";

interface SettingsPageProps {
    onOpenAccount: () => void;
    onOpenAccessibility: () => void;
    onOpenLanguage: () => void;
}

export default function SettingsPage({ onOpenAccount, onOpenAccessibility, onOpenLanguage }: SettingsPageProps) {
    const { t } = useTranslation();

    return (
        <section className="settings-page">
            <header className="settings-heading">
                <h1>{t("settings.title")}</h1>

                <p>{t("settings.description")}</p>
            </header>

            <div className="settings-options">
                <button type="button" className="settings-option" onClick={onOpenAccount}>
                    <div className="settings-option-content">
                        <div className="settings-option-icon" aria-hidden="true">
                            <span>👤</span>
                        </div>

                        <div className="settings-option-text">
                            <h2>{t("settings.account.title")}</h2>

                            <p>{t("settings.account.description")}</p>
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
                            <h2>{t("settings.accessibility.title")}</h2>

                            <p>{t("settings.accessibility.description")}</p>
                        </div>
                    </div>

                    <span className="settings-option-arrow" aria-hidden="true">
                        ›
                    </span>
                </button>

                <button type="button" className="settings-option" onClick={onOpenLanguage}>
                    <div className="settings-option-content">
                        <div className="settings-option-icon" aria-hidden="true">
                            <span>🌐</span>
                        </div>

                        <div className="settings-option-text">
                            <h2>{t("settings.language.title")}</h2>

                            <p>{t("settings.language.description")}</p>
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
