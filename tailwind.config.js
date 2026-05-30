/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      keyframes: {
        "pulse-dot": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(400%)" } },
        drift: { "0%": { transform: "translateY(0)" }, "100%": { transform: "translateY(-50%)" } },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s infinite",
        drift: "drift 6s linear infinite",
      },
    },
  },
  plugins: [],
};
