import { ErrorBoundary } from "./components/layout/error-boundary";
import "./components/layout/error-boundary.css";
import "./styles/tokens.css";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const queryClient = new QueryClient();
const Page = lazy(() => import("./app"));

createRoot(document.querySelector("#root")!).render(
    <StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <Suspense fallback={<div>Loading...</div>}>
                    <Page />
                </Suspense>
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>,
);
