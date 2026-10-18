/** @type {import('next').NextConfig} */
// On Vercel (VERCEL=1) the dashboard is a public demo: it always uses the in-app mock layer.
const demoDeploy = process.env.VERCEL === "1" || ["1", "true", "on"].includes((process.env.NEXT_PUBLIC_DEMO_DEPLOY ?? "").toLowerCase());
if (demoDeploy && process.env.NEXT_PUBLIC_API_BASE) {
  throw new Error("Demo deploy must not point at a backend: unset NEXT_PUBLIC_API_BASE.");
}
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: { NEXT_PUBLIC_DEMO_DEPLOY: demoDeploy ? "1" : "" },
};
export default nextConfig;
