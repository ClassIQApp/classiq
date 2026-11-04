import "./styles/tokens.css";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const queryClient = new QueryClient();
const Page = location.pathname.startsWith("/mock") ? lazy(() => import("./mock/Mock")) : lazy(() => import("./app"));

createRoot(document.querySelector("#root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <Suspense fallback={<div>Loading...</div>}>
                <Page />
            </Suspense>
        </QueryClientProvider>
    </StrictMode>,
);
