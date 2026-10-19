/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Schibsted Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        paper: "#edf0ee",
        surface: "#ffffff",
        ink: "#16202a",
        muted: "#5e6b73",
        faint: "#8a969c",
        line: "#d5dcd8",
        well: "#f4f6f5",
        helix: { DEFAULT: "#5b3fd9", deep: "#241a5e", soft: "#ece8fc" },
        go: { DEFAULT: "#138a63", soft: "#e1f3ec" },
        stall: { DEFAULT: "#d2412f", soft: "#fbe7e4" },
        wait: { DEFAULT: "#c98a12", soft: "#fbf1dc" },
      },
    },
  },
  plugins: [],
};
