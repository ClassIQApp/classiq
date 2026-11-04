export type NewTabOutcome = "opened" | "blocked" | "aborted";

export async function openInNewTab(resolveUrl: () => Promise<string>, signal: AbortSignal): Promise<NewTabOutcome> {
    const tab = window.open("about:blank", "_blank");

    if (tab) {
        tab.opener = null;
    }

    try {
        const url = await resolveUrl();

        if (signal.aborted) {
            tab?.close();

            return "aborted";
        }

        if (!tab) {
            return "blocked";
        }

        tab.location.href = url;

        return "opened";
    } catch (error) {
        tab?.close();

        throw error;
    }
}
