export type InterfaceLanguage = "en" | "es" | "ar" | "de" | "fr";

export interface LanguagePreference {
    language: InterfaceLanguage;
}

export interface LanguageOption {
    code: InterfaceLanguage;
    label: string;
    nativeLabel: string;
}

export const interfaceLanguages: readonly LanguageOption[] = [
    {
        code: "en",
        label: "English",
        nativeLabel: "English",
    },
    {
        code: "es",
        label: "Spanish",
        nativeLabel: "Español",
    },
    {
        code: "ar",
        label: "Arabic",
        nativeLabel: "العربية",
    },
    {
        code: "de",
        label: "German",
        nativeLabel: "Deutsch",
    },
    {
        code: "fr",
        label: "French",
        nativeLabel: "Français",
    },
];

const STORAGE_KEY = "classiq:language-preference";

const LANGUAGE_EVENT = "classiq:language-preference";

export const defaultLanguagePreference: LanguagePreference = {
    language: "en",
};

function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
    return value === "en" || value === "es" || value === "ar" || value === "de" || value === "fr";
}

export function readLanguagePreference(): LanguagePreference {
    try {
        const saved = globalThis.localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return defaultLanguagePreference;
        }

        const parsed: unknown = JSON.parse(saved);

        if (!parsed || typeof parsed !== "object") {
            return defaultLanguagePreference;
        }

        const value = parsed as Record<string, unknown>;

        return {
            language: isInterfaceLanguage(value.language) ? value.language : defaultLanguagePreference.language,
        };
    } catch {
        return defaultLanguagePreference;
    }
}

export function applyLanguagePreference(preference: LanguagePreference) {
    document.documentElement.lang = preference.language;

    document.documentElement.dir = preference.language === "ar" ? "rtl" : "ltr";
}

export function saveLanguagePreference(preference: LanguagePreference) {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));

    applyLanguagePreference(preference);

    globalThis.dispatchEvent(
        new CustomEvent(LANGUAGE_EVENT, {
            detail: preference,
        }),
    );
}

export function loadLanguagePreference() {
    const preference = readLanguagePreference();

    applyLanguagePreference(preference);

    return preference;
}

export const languagePreferenceEvent = LANGUAGE_EVENT;
