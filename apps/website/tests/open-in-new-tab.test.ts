import { openInNewTab } from "../src/components/courses/open-in-new-tab.ts";
import assert from "node:assert/strict";
import test from "node:test";

interface FakeTab {
    opener: unknown;
    closed: boolean;
    location: { href: string };
    close: () => void;
}

function installWindow(tab: FakeTab | null) {
    Object.assign(globalThis, { window: { open: () => tab } });
}

function fakeTab(): FakeTab {
    const tab: FakeTab = {
        opener: {},
        closed: false,
        location: { href: "about:blank" },
        close: () => {
            tab.closed = true;
        },
    };

    return tab;
}

test("the tab opens before the URL resolves and then navigates without an opener", async () => {
    const tab = fakeTab();
    installWindow(tab);

    const outcome = await openInNewTab(async () => "https://files.test/notes.pdf#page=3", new AbortController().signal);

    assert.equal(outcome, "opened");
    assert.equal(tab.opener, null);
    assert.equal(tab.location.href, "https://files.test/notes.pdf#page=3");
});

test("a blocked popup is reported", async () => {
    installWindow(null);

    assert.equal(await openInNewTab(async () => "https://files.test/notes.pdf", new AbortController().signal), "blocked");
});

test("an abort or failure closes the blank tab", async () => {
    const aborted = fakeTab();
    const failed = fakeTab();
    const controller = new AbortController();

    installWindow(aborted);
    const outcome = await openInNewTab(async () => {
        controller.abort();

        return "https://files.test/notes.pdf";
    }, controller.signal);

    installWindow(failed);
    await assert.rejects(
        openInNewTab(async () => {
            throw new Error("expired");
        }, new AbortController().signal),
        /expired/,
    );

    assert.equal(outcome, "aborted");
    assert.equal(aborted.closed, true);
    assert.equal(aborted.location.href, "about:blank");
    assert.equal(failed.closed, true);
});
