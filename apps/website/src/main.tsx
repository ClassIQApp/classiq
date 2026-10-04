import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const Page = location.pathname.startsWith("/mock") ? lazy(() => import("./mock/Mock")) : lazy(() => import("./app"));

createRoot(document.querySelector("#root")!).render(
    <StrictMode>
        <Suspense fallback={<div>Loading...</div>}>
            <Page />
        </Suspense>
    </StrictMode>,
);
