import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = async (file) =>
  ts.transpileModule(
    await readFile(
      new URL(`../src/services/${file}.ts`, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
const url = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const apiUrl = url(await compile("api.client"));
const api = await import(apiUrl);
const { authService } = await import(
  url(
    (await compile("auth.service")).replace(
      '"./api.client"',
      JSON.stringify(apiUrl),
    ),
  )
);
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const events = [];
globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
test("API client preserves JSON null, handles malformed responses and does not log out on wrong current credentials", async () => {
  const original = globalThis.fetch;
  try {
    api.sessionStore.save(
      "token-A",
      JSON.stringify({ id: "1", role: "customer", name: "Test" }),
      true,
    );
    globalThis.fetch = async () => new Response("null", { status: 200 });
    assert.equal(await api.apiRequest("/me"), null);
    globalThis.fetch = async () =>
      new Response("<html>gateway error</html>", { status: 502 });
    await assert.rejects(
      api.apiRequest("/me"),
      (error) => error instanceof api.ApiError && error.status === 502,
    );
    globalThis.fetch = async () =>
      new Response('{"code":"AUTH_INVALID","message":"Wrong password"}', {
        status: 401,
      });
    await assert.rejects(
      api.apiRequest("/me/password", { method: "POST", body: "{}" }),
      api.ApiError,
    );
    assert.equal(api.sessionStore.token(), "token-A");
    globalThis.fetch = async () =>
      new Response('{"message":"Expired token"}', { status: 401 });
    await assert.rejects(api.apiRequest("/me"), api.ApiError);
    assert.equal(api.sessionStore.token(), null);
    assert.ok(events.includes("d4-session-expired"));
  } finally {
    globalThis.fetch = original;
    api.sessionStore.clear();
  }
});
test("an old 401 arriving after a new login cannot clear the new session", async () => {
  const original = globalThis.fetch;
  let complete;
  try {
    api.sessionStore.save("old-token", "{}", true);
    globalThis.fetch = () => new Promise((resolve) => (complete = resolve));
    const request = api.apiRequest("/me");
    api.sessionStore.save("new-token", "{}", false);
    complete(new Response('{"message":"Expired"}', { status: 401 }));
    await assert.rejects(request, api.ApiError);
    assert.equal(api.sessionStore.token(), "new-token");
  } finally {
    globalThis.fetch = original;
    api.sessionStore.clear();
  }
});
test("malformed stored session is cleared instead of redirecting to an unrecognized role", () => {
  for (const session of [
    null,
    {},
    { id: "1", role: "unknown", name: "bad" },
    { role: "customer", name: "bad" },
  ]) {
    api.sessionStore.save("test", JSON.stringify(session), true);
    assert.equal(authService.getSession(), null);
    assert.equal(api.sessionStore.token(), null);
  }
  api.sessionStore.save(
    "test",
    JSON.stringify({ id: "1", role: "customer", name: "Test" }),
    true,
  );
  assert.equal(authService.getSession().role, "customer");
  api.sessionStore.clear();
});
test("optional device-token refresh failure preserves the successful login", async () => {
  const original = globalThis.fetch;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  let logins = 0;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { platform: "Test", userAgent: "Test browser" },
    });
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/auth/login")) {
        logins++;
        return logins === 1
          ? Response.json({
              accessToken: "valid-first-token",
              user: {
                actorType: "customer",
                role: "customer",
                customerId: 101,
                code: "C101",
                name: "Test",
              },
            })
          : new Response("Unavailable", { status: 503 });
      }
      assert.ok(String(url).endsWith("/me/devices"));
      return new Response(null, { status: 204 });
    };
    const user = await authService.login("test", "test-password", false);
    assert.equal(user.id, "101");
    assert.equal(api.sessionStore.token(), "valid-first-token");
    assert.equal(localStorage.getItem("d4-access-token"), null);
    assert.equal(logins, 2);
  } finally {
    globalThis.fetch = original;
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
    api.sessionStore.clear();
  }
});
