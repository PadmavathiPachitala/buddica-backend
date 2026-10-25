const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createTestLimiter } = require("../../src/middleware/rateLimiter");
const errorHandler = require("../../src/middleware/errorHandler");

describe("Rate Limiter - Integration Tests", () => {
    let server;
    let baseUrl;

    before(async () => {
        const app = express();
        app.use(express.json());

        // Test route limited to 2 requests per window
        const limiter = createTestLimiter({
            windowMs: 10000,
            max: 2,
            message: "Rate limit exceeded for test.",
        });

        app.get("/test-limit", limiter, (req, res) => {
            res.status(200).json({ status: "success", message: "ok" });
        });

        app.use(errorHandler);

        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it("should allow requests under the limit and block with 429 when exceeded", async () => {
        // Request 1: Allowed
        const res1 = await fetch(`${baseUrl}/test-limit`);
        assert.equal(res1.status, 200);

        // Request 2: Allowed
        const res2 = await fetch(`${baseUrl}/test-limit`);
        assert.equal(res2.status, 200);

        // Request 3: Blocked with HTTP 429
        const res3 = await fetch(`${baseUrl}/test-limit`);
        assert.equal(res3.status, 429);

        const data3 = await res3.json();
        assert.equal(data3.status, "fail");
        assert.equal(data3.message, "Rate limit exceeded for test.");
    });
});
