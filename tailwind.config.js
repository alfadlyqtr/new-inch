/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
      extend: {
        colors: {
          brand: {
            // Primary gradient endpoints for buttons and active nav
            primary: "#7C3AED", // approx. indigo-600
            fuchsia: "#D946EF", // approx. fuchsia-500
          },
        },
      },
    },
    plugins: [],
  }