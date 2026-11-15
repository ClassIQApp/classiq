import { createApp } from "../app.ts";
import { createDatabase } from "../db/client.ts";
import app from "../index.ts";
import { handler } from "../lambda.ts";
import type { LambdaEvent } from "hono/aws-lambda";
import { describe, expect, it, vi } from "vitest";

describe("api", () => {
    it("returns the expected response", async () => {
        const response = await app.request("/");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "hello from node" });
    });

    it("serves the same route through the Lambda adapter", async () => {
        const event = {
            version: "2.0",
            routeKey: "$default",
            rawPath: "/",
            rawQueryString: "",
            headers: { host: "example.com" },
            requestContext: {
                accountId: "123456789012",
                apiId: "test",
                authentication: null,
                authorizer: {},
                domainName: "example.com",
                domainPrefix: "example",
                http: {
                    method: "GET",
                    path: "/",
                    protocol: "HTTP/1.1",
                    sourceIp: "127.0.0.1",
                    userAgent: "vitest",
                },
                requestId: "test",
                routeKey: "$default",
                stage: "$default",
                time: "",
                timeEpoch: 0,
            },
            body: null,
            isBase64Encoded: false,
        } satisfies LambdaEvent;

        const response = await handler(event);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ message: "hello from node" });
    });

    it("injects the database into routes", async () => {
        const db = createDatabase("postgres://user:pass@localhost:5432/test");
        const injected = createApp(() => db);

        injected.get("/db", (c) => c.json({ same: c.var.getDb() === db }));

        const response = await injected.request("/db");

        expect(await response.json()).toEqual({ same: true });
        await db.end();
    });

    it("answers unknown routes with a JSON not-found error", async () => {
        const response = await app.request("/missing");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: "NOT_FOUND", message: "Not found" });
    });

    it("hides unexpected error details and returns a request id", async () => {
        const failing = createApp(() => createDatabase("postgres://user:pass@localhost:5432/test"));
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        failing.get("/boom", () => {
            throw new Error("password=hunter2");
        });

        const response = await failing.request("/boom");
        const body = JSON.stringify(await response.clone().json());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong. Try again." });
        expect(body).not.toContain("hunter2");
        expect(response.headers.get("X-Request-Id")).toBeTruthy();
        expect(error).toHaveBeenCalledOnce();

        error.mockRestore();
    });
});
