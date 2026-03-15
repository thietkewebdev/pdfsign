#!/usr/bin/env node

/**
 * Admin API smoke checks.
 *
 * Usage:
 *   node scripts/admin-smoke.cjs
 *
 * Optional env:
 *   APP_URL=http://localhost:3000
 *   ADMIN_COOKIE="next-auth.session-token=...; __Secure-next-auth.session-token=..."
 */

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE || "";

async function check(name, path, expectedStatuses, withAdminCookie = false) {
  const headers = {};
  if (withAdminCookie && ADMIN_COOKIE) {
    headers.cookie = ADMIN_COOKIE;
  }

  const res = await fetch(`${APP_URL}${path}`, {
    method: "GET",
    headers,
  });

  const ok = expectedStatuses.includes(res.status);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} -> ${res.status} ${path}`);
  return ok;
}

async function run() {
  const results = [];

  // Unauthenticated should be blocked by API auth checks.
  results.push(
    await check("overview unauth blocked", "/api/admin/overview", [401, 403], false)
  );

  // If admin cookie is supplied, endpoints should return 200.
  if (ADMIN_COOKIE) {
    results.push(await check("overview admin access", "/api/admin/overview", [200], true));
    results.push(await check("users admin access", "/api/admin/users", [200], true));
    results.push(await check("plans admin access", "/api/admin/plans", [200], true));
    results.push(await check("documents admin access", "/api/admin/documents", [200], true));
    results.push(await check("contracts admin access", "/api/admin/contracts", [200], true));
    results.push(await check("usage admin access", "/api/admin/usage?days=30", [200], true));
    results.push(await check("storage admin access", "/api/admin/storage", [200], true));
  } else {
    console.log("INFO ADMIN_COOKIE not set, skipping authenticated smoke checks.");
  }

  if (results.every(Boolean)) {
    console.log("Admin smoke checks completed.");
    process.exit(0);
  }

  console.error("Admin smoke checks failed.");
  process.exit(1);
}

run().catch((err) => {
  console.error("Smoke script crashed:", err);
  process.exit(1);
});
