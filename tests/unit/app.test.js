const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const app = require("../../src/app");

describe("App & Operational Security - Unit Tests", () => {
    let server;
    let baseUrl;

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => {
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

    it("GET /health - should return 200 with health metrics and uptime", async () => {
        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "ok");
        assert.equal(typeof data.uptime, "number");
        assert.ok(data.timestamp);
    });

    it("should include Helmet security headers on responses", async () => {
        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.ok(res.headers.get("x-dns-prefetch-control"));
    });

    it("should include CORS headers on preflight OPTIONS request", async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        });
        assert.equal(res.headers.get("access-control-allow-origin"), "*");
    });

    it("GET /unmatched-route - should return 404 with standard error format", async () => {
        const res = await fetch(`${baseUrl}/api/nonexistent`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /not found/i);
    });
});
