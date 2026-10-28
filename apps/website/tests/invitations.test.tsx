import { ApiError, createApiFetch } from "../src/api/auth/client.ts";
import { createInvitationApi } from "../src/api/invitations/client.ts";
import type { Invitation } from "../src/api/invitations/types.ts";
import { refreshAfterAcceptance } from "../src/api/invitations/use-invitations.ts";
import InviteEmailForm, { validateInvitationEmail } from "../src/components/invitations/invite-email-form.tsx";
import PendingInvitationList from "../src/components/invitations/pending-invitation-list.tsx";
import type { PendingInvitationListState } from "../src/components/invitations/pending-invitation-list.tsx";
import { QueryClient } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const invitation: Invitation = {
    id: "7",
    courseId: "3",
    courseName: "Operating Systems",
    email: "student@example.com",
    status: "pending",
    createdAt: "2026-10-27T12:00:00.000Z",
};

function ignore() {}

test("invitation requests send credentials, JSON bodies, and encoded identifiers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const api = createInvitationApi(
        createApiFetch("https://api.example.com", async (url, init) => {
            calls.push({ url: String(url), init });

            if (String(url).endsWith("/accept")) {
                return Response.json({ courseId: "3", role: "member" });
            }

            if (init?.method === "POST") {
                return Response.json(invitation, { status: 201 });
            }

            return Response.json({ items: [invitation] });
        }),
    );

    assert.deepEqual(await api.listPending(), [invitation]);
    assert.deepEqual(await api.invite("3", "student@example.com"), invitation);
    assert.deepEqual(await api.accept("7"), { courseId: "3", role: "member" });

    assert.deepEqual(
        calls.map(({ url, init }) => [init?.method ?? "GET", url]),
        [
            ["GET", "https://api.example.com/invitations"],
            ["POST", "https://api.example.com/courses/3/invitations"],
            ["POST", "https://api.example.com/invitations/7/accept"],
        ],
    );
    assert.equal(calls[1]?.init?.body, JSON.stringify({ email: "student@example.com" }));
    assert.equal(calls[2]?.init?.body, "{}");

    for (const { init } of calls) {
        assert.equal(init?.credentials, "include");
    }
});

test("invitation conflicts surface the server's code and message", async () => {
    const api = createInvitationApi(
        createApiFetch("", async () =>
            Response.json({ code: "INVITATION_EXISTS", message: "That account already has a pending invitation." }, { status: 409 }),
        ),
    );

    await assert.rejects(
        api.invite("3", "student@example.com"),
        (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "INVITATION_EXISTS",
    );
});

test("acceptance refreshes the recipient's invitations and courses only", async () => {
    const cache = new QueryClient();

    cache.setQueryData(["invitations", "2"], [invitation]);
    cache.setQueryData(["courses", "2"], []);
    cache.setQueryData(["courses", "2", "3"], {});
    cache.setQueryData(["courses", "1"], []);
    cache.setQueryData(["invitations", "1"], []);

    await refreshAfterAcceptance(cache, "2");

    const invalidated = cache
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.isInvalidated)
        .map((query) => query.queryKey);

    assert.deepEqual(invalidated, [
        ["invitations", "2"],
        ["courses", "2"],
        ["courses", "2", "3"],
    ]);
});

test("pending invitations show loading, retryable errors, and nothing when empty", () => {
    const loading = renderToStaticMarkup(
        <PendingInvitationList list={{ status: "loading" }} acceptance={{ status: "idle" }} onRetry={ignore} onAccept={ignore} />,
    );

    assert.match(loading, /aria-busy="true"/);
    assert.match(loading, /Loading invitations/);

    const failed = renderToStaticMarkup(
        <PendingInvitationList
            list={{ status: "error", message: "Network unavailable" }}
            acceptance={{ status: "idle" }}
            onRetry={ignore}
            onAccept={ignore}
        />,
    );

    assert.match(failed, /role="alert"[^>]*>.*Network unavailable/);
    assert.match(failed, />Retry</);

    const empty = renderToStaticMarkup(
        <PendingInvitationList
            list={{ status: "ready", invitations: [] }}
            acceptance={{ status: "idle" }}
            onRetry={ignore}
            onAccept={ignore}
        />,
    );

    assert.equal(empty, "");
});

test("pending invitations show acceptance progress, failures, and the joined course", () => {
    const list: PendingInvitationListState = {
        status: "ready",
        invitations: [invitation, { ...invitation, id: "8", courseName: "Linear Algebra" }],
    };

    const idle = renderToStaticMarkup(
        <PendingInvitationList list={list} acceptance={{ status: "idle" }} onRetry={ignore} onAccept={ignore} />,
    );

    assert.match(idle, /Operating Systems/);
    assert.match(idle, /aria-label="Accept: Linear Algebra"/);
    assert.doesNotMatch(idle, /disabled/);

    const accepting = renderToStaticMarkup(
        <PendingInvitationList list={list} acceptance={{ status: "accepting", invitationId: "7" }} onRetry={ignore} onAccept={ignore} />,
    );

    assert.match(accepting, /Joining…/);
    assert.equal(accepting.match(/disabled=""/g)?.length, 2);

    const failed = renderToStaticMarkup(
        <PendingInvitationList
            list={list}
            acceptance={{ status: "failed", invitationId: "7", message: "The invitation was not found." }}
            onRetry={ignore}
            onAccept={ignore}
        />,
    );

    assert.match(failed, /The invitation was not found/);
    assert.match(failed, /aria-label="Try again: Operating Systems"/);
    assert.match(failed, /aria-label="Accept: Linear Algebra"/);

    const joined = renderToStaticMarkup(
        <PendingInvitationList
            list={{ status: "ready", invitations: [] }}
            acceptance={{ status: "joined", courseName: "Operating Systems" }}
            onRetry={ignore}
            onAccept={ignore}
        />,
    );

    assert.match(joined, /role="status"[^>]*>You joined Operating Systems/);
});

test("the invite form validates blank emails before sending", () => {
    assert.match(validateInvitationEmail("   ") ?? "", /Enter the email address/);
    assert.equal(validateInvitationEmail(" student@example.com "), null);
});

test("the invite form shows sending, server errors, and sent confirmation", () => {
    const editing = renderToStaticMarkup(
        <InviteEmailForm email="" state={{ status: "editing" }} onEmailChange={ignore} onSubmit={ignore} />,
    );

    assert.match(editing, /type="email"/);
    assert.match(editing, /required/);
    assert.match(editing, />Send invitation</);

    const sending = renderToStaticMarkup(
        <InviteEmailForm email="student@example.com" state={{ status: "sending" }} onEmailChange={ignore} onSubmit={ignore} />,
    );

    assert.match(sending, /aria-busy="true"/);
    assert.match(sending, />Sending…</);
    assert.equal(sending.match(/disabled=""/g)?.length, 2);

    for (const message of [
        "No ClassIQ account uses that email. Ask them to create an account first.",
        "That account is already part of this course.",
        "That account already has a pending invitation to this course.",
    ]) {
        const failed = renderToStaticMarkup(
            <InviteEmailForm email="student@example.com" state={{ status: "failed", message }} onEmailChange={ignore} onSubmit={ignore} />,
        );

        assert.ok(failed.includes(message));
        assert.match(failed, /aria-invalid="true"/);
        assert.doesNotMatch(failed, /disabled/);
    }

    const sent = renderToStaticMarkup(
        <InviteEmailForm email="" state={{ status: "sent", email: "student@example.com" }} onEmailChange={ignore} onSubmit={ignore} />,
    );

    assert.match(sent, /role="status"[^>]*>Invitation sent to student@example.com/);
});
