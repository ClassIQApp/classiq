import { ApiError } from "../src/api/auth/client";
import type { Lecture } from "../src/api/lectures/types";
import { createSearchApi, searchQueryKey } from "../src/api/search/client";
import type { SearchFilters, SearchPassage } from "../src/api/search/client";
import { formatTimestamp, SearchResults } from "../src/components/courses/course-search";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const lecture: Lecture = {
    id: "4",
    title: "Enzymes",
    description: "Catalysis.",
    status: "ready",
    statusMessage: "Ready.",
    resources: [],
    generatedContent: [],
};

const resourcePassage: SearchPassage = {
    id: "11",
    kind: "resource",
    courseId: "10",
    lectureId: "4",
    resourceId: "7",
    title: "enzyme-notes.pdf",
    content: "Enzymes are biological catalysts that lower activation energy.",
    pageNumber: 3,
    score: 0.6,
};

const transcriptPassage: SearchPassage = {
    id: "12",
    kind: "transcript",
    courseId: "10",
    lectureId: "4",
    title: "Enzymes",
    content: "Catalysts are not consumed by the reaction.",
    startSeconds: 754,
    endSeconds: 790,
    score: 0.4,
};

const api = createSearchApi(async () => Response.json({ items: [] }));

function ignore() {}

function render(client: QueryClient, filters: SearchFilters, opening: string | null = null) {
    return renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <SearchResults
                accountId="account"
                courseId="10"
                filters={filters}
                lectures={[lecture]}
                api={api}
                opening={opening}
                onOpenResource={ignore}
                onOpenLecture={ignore}
            />
        </QueryClientProvider>,
    );
}

test("search requests send the query, filters, and abort signal for the course", async () => {
    const requests: { path: string; signal?: AbortSignal | null }[] = [];
    const controller = new AbortController();
    const client = createSearchApi(async (path, init) => {
        requests.push({ path, signal: init?.signal });

        return Response.json({ items: [resourcePassage] });
    });

    const items = await client.search("10", { text: "activation energy", kind: "resource", lectureId: "4" }, controller.signal);

    assert.deepEqual(items, [resourcePassage]);
    assert.equal(requests[0]?.path, "/courses/10/search?q=activation+energy&limit=20&kind=resource&lectureId=4");
    assert.equal(requests[0]?.signal, controller.signal);
});

test("search requests omit unset filters", async () => {
    const paths: string[] = [];
    const client = createSearchApi(async (path) => {
        paths.push(path);

        return Response.json({ items: [] });
    });

    await client.search("10", { text: "enzymes" });

    assert.deepEqual(paths, ["/courses/10/search?q=enzymes&limit=20"]);
});

test("search results are cached per account, course, and filters", () => {
    const filters = { text: "enzymes" };

    assert.notDeepEqual(searchQueryKey("a", "10", filters), searchQueryKey("b", "10", filters));
    assert.notDeepEqual(searchQueryKey("a", "10", filters), searchQueryKey("a", "20", filters));
    assert.notDeepEqual(searchQueryKey("a", "10", filters), searchQueryKey("a", "10", { ...filters, kind: "resource" }));
});

test("an empty query prompts for search terms without requesting", () => {
    const markup = render(new QueryClient(), { text: "" });

    assert.match(markup, /Enter a word or phrase/);
    assert.doesNotMatch(markup, /Searching/);
});

test("a pending search shows a loading status", () => {
    const markup = render(new QueryClient(), { text: "enzymes" });

    assert.match(markup, /role="status">Searching…/);
});

test("ranked results show the source, location, snippet, and an action", () => {
    const client = new QueryClient();
    const filters = { text: "catalysts" };
    client.setQueryData(searchQueryKey("account", "10", filters), [resourcePassage, transcriptPassage]);

    const markup = render(client, filters);

    assert.match(markup, /2 results/);
    assert.match(markup, /enzyme-notes\.pdf/);
    assert.match(markup, /PDF resource · Page 3 · Enzymes/);
    assert.match(markup, /biological catalysts that lower activation energy/);
    assert.match(markup, /Open PDF at page 3/);
    assert.match(markup, /Lecture transcript · 12:34/);
    assert.match(markup, /Open lecture at 12:34/);
    assert.ok(markup.indexOf("enzyme-notes.pdf") < markup.indexOf("not consumed by the reaction"));
});

test("opening a PDF disables other result actions", () => {
    const client = new QueryClient();
    const filters = { text: "catalysts" };
    client.setQueryData(searchQueryKey("account", "10", filters), [resourcePassage, { ...resourcePassage, id: "13", pageNumber: 5 }]);

    const markup = render(client, filters, "11");

    assert.match(markup, /disabled="">Opening…/);
    assert.match(markup, /disabled="">Open PDF at page 5/);
});

test("a search with no matches says so", () => {
    const client = new QueryClient();
    const filters = { text: "photosynthesis" };
    client.setQueryData(searchQueryKey("account", "10", filters), []);

    const markup = render(client, filters);

    assert.match(markup, /No results for “photosynthesis”/);
});

function failedClient() {
    return new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
}

test("a failed search shows the server's message with a retry", async () => {
    const client = failedClient();
    const filters = { text: "enzymes" };

    await client.prefetchQuery({
        queryKey: searchQueryKey("account", "10", filters),
        queryFn: () => Promise.reject(new ApiError(400, "INVALID_SEARCH", "The content search query is invalid.")),
        retry: false,
    });

    const markup = render(client, filters);

    assert.match(markup, /role="alert">The content search query is invalid\./);
    assert.match(markup, />Retry</);
});

test("an unexpected failure hides the raw error", async () => {
    const client = failedClient();
    const filters = { text: "enzymes" };

    await client.prefetchQuery({
        queryKey: searchQueryKey("account", "10", filters),
        queryFn: () => Promise.reject(new TypeError("Failed to fetch 10.0.0.1")),
        retry: false,
    });

    const markup = render(client, filters);

    assert.match(markup, /Search is unavailable right now/);
    assert.doesNotMatch(markup, /10\.0\.0\.1/);
});

test("timestamps use minutes and seconds, adding hours for long lectures", () => {
    assert.equal(formatTimestamp(5), "0:05");
    assert.equal(formatTimestamp(754.9), "12:34");
    assert.equal(formatTimestamp(3725), "1:02:05");
});
