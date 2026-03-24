/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontWeight: { extralight: "200" },
      transitionDuration: { "1500": "1500ms" },
      letterSpacing: { widest2: "0.3em" },
    },
  },
  plugins: [],
}

export default config
