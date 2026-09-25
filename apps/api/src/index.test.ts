import app from "./index.ts";
import { handler } from "./lambda.ts";
import type { LambdaEvent } from "hono/aws-lambda";
import { describe, expect, it } from "vitest";

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
});
