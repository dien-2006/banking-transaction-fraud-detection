import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { navy: "#000064", coral: "#f80820", blush: "#fff0f0", canvas: "#ffffff" },
    boxShadow: { card: "0 8px 30px rgba(16,42,86,.07)" }
  } }, plugins: []
};
export default config;
