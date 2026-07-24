/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef2ff",
          600: "#1e40af",
          700: "#1e3a8a",
          900: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};
