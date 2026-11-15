import { ErrorBoundary, ErrorFallback } from "../src/components/layout/error-boundary";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

test("the fallback explains the problem and offers a reload", () => {
    const markup = renderToStaticMarkup(<ErrorFallback onReload={() => undefined} />);

    assert.match(markup, /Something went wrong/);
    assert.match(markup, /Reload page/);
});

test("the boundary renders its children when nothing fails", () => {
    const markup = renderToStaticMarkup(
        <ErrorBoundary>
            <p>All good</p>
        </ErrorBoundary>,
    );

    assert.match(markup, /All good/);
});
