import { handler } from "./index.ts";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import { describe, expect, it } from "vitest";

describe("handler", () => {
    it("returns 200", async () => {
        const result = (await handler({} as APIGatewayProxyEventV2, {} as Context, () => {})) as APIGatewayProxyStructuredResultV2;

        expect(result.statusCode).toBe(200);
    });
});
