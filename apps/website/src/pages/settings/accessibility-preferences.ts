export type TextSize = "small" | "default" | "large";

export type PlaybackSpeed = "0.75" | "1" | "1.25" | "1.5" | "2";

export interface AccessibilityPreferences {
    textSize: TextSize;
    automaticCaptions: boolean;
    playbackSpeed: PlaybackSpeed;
}

const STORAGE_KEY = "classiq:accessibility-preferences";

export const defaultAccessibilityPreferences: AccessibilityPreferences = {
    textSize: "default",
    automaticCaptions: false,
    playbackSpeed: "1",
};

function isTextSize(value: unknown): value is TextSize {
    return value === "small" || value === "default" || value === "large";
}

function isPlaybackSpeed(value: unknown): value is PlaybackSpeed {
    return value === "0.75" || value === "1" || value === "1.25" || value === "1.5" || value === "2";
}

export function readAccessibilityPreferences(): AccessibilityPreferences {
    try {
        const saved = globalThis.localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return defaultAccessibilityPreferences;
        }

        const value: unknown = JSON.parse(saved);

        if (!value || typeof value !== "object") {
            return defaultAccessibilityPreferences;
        }

        const preferences = value as Record<string, unknown>;

        return {
            textSize: isTextSize(preferences.textSize) ? preferences.textSize : defaultAccessibilityPreferences.textSize,

            automaticCaptions:
                typeof preferences.automaticCaptions === "boolean"
                    ? preferences.automaticCaptions
                    : defaultAccessibilityPreferences.automaticCaptions,

            playbackSpeed: isPlaybackSpeed(preferences.playbackSpeed)
                ? preferences.playbackSpeed
                : defaultAccessibilityPreferences.playbackSpeed,
        };
    } catch {
        return defaultAccessibilityPreferences;
    }
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences) {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

    applyAccessibilityPreferences(preferences);

    globalThis.dispatchEvent(
        new CustomEvent("classiq:accessibility-preferences", {
            detail: preferences,
        }),
    );
}

export function applyAccessibilityPreferences(preferences: AccessibilityPreferences) {
    document.documentElement.dataset.textSize = preferences.textSize;
}

export function loadAccessibilityPreferences() {
    const preferences = readAccessibilityPreferences();

    applyAccessibilityPreferences(preferences);

    return preferences;
}
