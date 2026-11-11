import { useTranslation } from "../../i18n/use-translation";
import { loadAccessibilityPreferences, saveAccessibilityPreferences } from "./accessibility-preferences";
import type { AccessibilityPreferences, PlaybackSpeed, TextSize } from "./accessibility-preferences";
import "./accessibility-settings.css";
import { useState } from "react";

interface AccessibilitySettingsProps {
    onBack: () => void;
}

export default function AccessibilitySettings({ onBack }: AccessibilitySettingsProps) {
    const { t } = useTranslation();

    const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => loadAccessibilityPreferences());

    function updatePreferences(changes: Partial<AccessibilityPreferences>) {
        const nextPreferences = {
            ...preferences,
            ...changes,
        };

        setPreferences(nextPreferences);
        saveAccessibilityPreferences(nextPreferences);
    }

    function changeTextSize(textSize: TextSize) {
        updatePreferences({
            textSize,
        });
    }

    function toggleCaptions() {
        updatePreferences({
            automaticCaptions: !preferences.automaticCaptions,
        });
    }

    function changePlaybackSpeed(playbackSpeed: PlaybackSpeed) {
        updatePreferences({
            playbackSpeed,
        });
    }

    return (
        <section className="accessibility-page">
            <button type="button" className="settings-back-button" onClick={onBack}>
                {t("settings.back")}
            </button>

            <header className="accessibility-header">
                <p className="accessibility-eyebrow">{t("accessibility.eyebrow")}</p>

                <h1>{t("accessibility.title")}</h1>

                <p className="accessibility-description">{t("accessibility.description")}</p>
            </header>

            <div className="accessibility-settings-list">
                <section className="accessibility-group">
                    <div className="accessibility-group-title">
                        <h2>{t("accessibility.display")}</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>{t("accessibility.textSize")}</h3>

                            <p>{t("accessibility.textSizeDescription")}</p>
                        </div>

                        <div className="accessibility-segmented-control" aria-label={t("accessibility.textSize")}>
                            <button
                                type="button"
                                className={preferences.textSize === "small" ? "active" : ""}
                                aria-pressed={preferences.textSize === "small"}
                                onClick={() => changeTextSize("small")}
                            >
                                {t("accessibility.small")}
                            </button>

                            <button
                                type="button"
                                className={preferences.textSize === "default" ? "active" : ""}
                                aria-pressed={preferences.textSize === "default"}
                                onClick={() => changeTextSize("default")}
                            >
                                {t("accessibility.default")}
                            </button>

                            <button
                                type="button"
                                className={preferences.textSize === "large" ? "active" : ""}
                                aria-pressed={preferences.textSize === "large"}
                                onClick={() => changeTextSize("large")}
                            >
                                {t("accessibility.large")}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="accessibility-group">
                    <div className="accessibility-group-title">
                        <h2>{t("accessibility.captions")}</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>{t("accessibility.automaticCaptions")}</h3>

                            <p>{t("accessibility.captionsDescription")}</p>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-label={t("accessibility.automaticCaptions")}
                            aria-checked={preferences.automaticCaptions}
                            className={`accessibility-switch ${preferences.automaticCaptions ? "active" : ""}`}
                            onClick={toggleCaptions}
                        >
                            <span />
                        </button>
                    </div>
                </section>

                <section className="accessibility-group">
                    <div className="accessibility-group-title">
                        <h2>{t("accessibility.playback")}</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>{t("accessibility.playbackSpeed")}</h3>

                            <p>{t("accessibility.playbackDescription")}</p>
                        </div>

                        <select
                            className="accessibility-speed-select"
                            value={preferences.playbackSpeed}
                            onChange={(event) => changePlaybackSpeed(event.target.value as PlaybackSpeed)}
                            aria-label={t("accessibility.playbackSpeed")}
                        >
                            <option value="0.75">0.75x</option>

                            <option value="1">1x</option>

                            <option value="1.25">1.25x</option>

                            <option value="1.5">1.5x</option>

                            <option value="2">2x</option>
                        </select>
                    </div>
                </section>
            </div>
        </section>
    );
}
