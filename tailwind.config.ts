import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        n: {
          ink: "#171717",
          dark: "#262626",
          muted: "#525252",
          dim: "#737373",
          focus: "#3b82f6",
          bg: "#fafafa",
          surface: "#ffffff",
          border: "#e5e5e5",
          hover: "#f5f5f5",
        },
      },
      boxShadow: {
        n: "0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 24px rgba(0, 0, 0, 0.04)",
        "n-lg": "0 1px 3px rgba(0, 0, 0, 0.04), 0 24px 80px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
