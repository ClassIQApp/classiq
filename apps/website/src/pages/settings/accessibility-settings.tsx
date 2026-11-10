import { loadAccessibilityPreferences, saveAccessibilityPreferences } from "./accessibility-preferences";
import type { AccessibilityPreferences, PlaybackSpeed, TextSize } from "./accessibility-preferences";
import "./accessibility-settings.css";
import { useState } from "react";

interface AccessibilitySettingsProps {
    onBack: () => void;
}

export default function AccessibilitySettings({ onBack }: AccessibilitySettingsProps) {
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
                ← Back to Settings
            </button>

            <header className="accessibility-header">
                <p className="accessibility-eyebrow">Preferences</p>

                <h1>Accessibility</h1>

                <p className="accessibility-description">Make ClassIQ more comfortable to read, watch, and use.</p>
            </header>

            <div className="accessibility-settings-list">
                <section className="accessibility-group">
                    <div className="accessibility-group-title">
                        <h2>Display</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>Text size</h3>

                            <p>Change the size of text throughout ClassIQ.</p>
                        </div>

                        <div className="accessibility-segmented-control" aria-label="Text size">
                            <button
                                type="button"
                                className={preferences.textSize === "small" ? "active" : ""}
                                aria-pressed={preferences.textSize === "small"}
                                onClick={() => changeTextSize("small")}
                            >
                                Small
                            </button>

                            <button
                                type="button"
                                className={preferences.textSize === "default" ? "active" : ""}
                                aria-pressed={preferences.textSize === "default"}
                                onClick={() => changeTextSize("default")}
                            >
                                Default
                            </button>

                            <button
                                type="button"
                                className={preferences.textSize === "large" ? "active" : ""}
                                aria-pressed={preferences.textSize === "large"}
                                onClick={() => changeTextSize("large")}
                            >
                                Large
                            </button>
                        </div>
                    </div>
                </section>

                <section className="accessibility-group">
                    <div className="accessibility-group-title">
                        <h2>Captions</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>Automatic captions</h3>

                            <p>Show captions automatically when they are available.</p>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-label="Automatic captions"
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
                        <h2>Playback</h2>
                    </div>

                    <div className="accessibility-setting">
                        <div className="accessibility-setting-copy">
                            <h3>Default playback speed</h3>

                            <p>Choose the speed used when a lecture starts playing.</p>
                        </div>

                        <select
                            className="accessibility-speed-select"
                            value={preferences.playbackSpeed}
                            onChange={(event) => changePlaybackSpeed(event.target.value as PlaybackSpeed)}
                            aria-label="Default playback speed"
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
