import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

// Lazy so each page only loads its own global CSS
const Page = location.pathname.startsWith("/mock") ? lazy(() => import("./mock/Mock.tsx")) : lazy(() => import("./app.tsx"));

createRoot(document.querySelector("#root")!).render(
    <StrictMode>
        <Suspense>
            <Page />
        </Suspense>
    </StrictMode>,
);
