import { useTranslation } from "../../i18n/use-translation";
import { interfaceLanguages, loadLanguagePreference, saveLanguagePreference } from "./language-preferences";
import type { InterfaceLanguage, LanguagePreference } from "./language-preferences";
import "./language-settings.css";
import { useState } from "react";

interface LanguageSettingsProps {
    onBack: () => void;
}

export default function LanguageSettings({ onBack }: LanguageSettingsProps) {
    const { t } = useTranslation();

    const [preference, setPreference] = useState<LanguagePreference>(() => loadLanguagePreference());

    function changeLanguage(language: InterfaceLanguage) {
        const nextPreference = {
            language,
        };

        setPreference(nextPreference);
        saveLanguagePreference(nextPreference);
    }

    return (
        <section className="language-settings-page">
            <button type="button" className="settings-back-button" onClick={onBack}>
                {t("settings.back")}
            </button>

            <header className="language-settings-header">
                <p className="language-settings-eyebrow">{t("language.eyebrow")}</p>

                <h1>{t("language.title")}</h1>

                <p className="language-settings-description">{t("language.description")}</p>
            </header>

            <div className="language-settings-list">
                <section className="language-settings-section">
                    <div className="language-settings-section-title">
                        <h2>{t("language.interfaceLanguage")}</h2>
                    </div>

                    <div className="language-settings-options">
                        {interfaceLanguages.map((language) => {
                            const selected = preference.language === language.code;

                            return (
                                <button
                                    key={language.code}
                                    type="button"
                                    className={`language-option ${selected ? "selected" : ""}`}
                                    aria-pressed={selected}
                                    onClick={() => changeLanguage(language.code)}
                                >
                                    <div className="language-option-text">
                                        <strong>{language.nativeLabel}</strong>

                                        {language.nativeLabel !== language.label && <span>{language.label}</span>}
                                    </div>

                                    <span className="language-option-check" aria-hidden="true">
                                        {selected ? "✓" : ""}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </section>
    );
}
