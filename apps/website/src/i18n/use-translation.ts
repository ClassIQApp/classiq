import { languagePreferenceEvent, readLanguagePreference } from "../pages/settings/language-preferences";
import type { InterfaceLanguage } from "../pages/settings/language-preferences";
import { translate } from "./translations";
import type { TranslationKey } from "./translations";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
    globalThis.addEventListener(languagePreferenceEvent, onChange);

    globalThis.addEventListener("storage", onChange);

    return () => {
        globalThis.removeEventListener(languagePreferenceEvent, onChange);

        globalThis.removeEventListener("storage", onChange);
    };
}

function getSnapshot(): InterfaceLanguage {
    return readLanguagePreference().language;
}

function getServerSnapshot(): InterfaceLanguage {
    return "en";
}

export function useTranslation() {
    const language = useSyncExternalStore<InterfaceLanguage>(subscribe, getSnapshot, getServerSnapshot);

    return {
        language,

        t: (key: TranslationKey) => translate(language, key),
    };
}
