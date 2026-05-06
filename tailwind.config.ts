import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ledger: {
          ink: "#17201b",
          moss: "#324f3b",
          lime: "#d7f171",
          cream: "#f6f0df",
          paper: "#fffcf2",
          line: "#ded5bc",
        },
      },
      boxShadow: {
        ledger: "0 24px 80px rgba(23, 32, 27, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
