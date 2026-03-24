/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./public/**/*.{html,js}'],
    theme: {
        extend: {
            colors: {
                primary: '#10366b',
                secondary: '#00aec7',
                accent: '#f36b00',
                bg: '#f8fafc',
                surface: '#ffffff',
            },
            fontFamily: {
                sans: ['Montserrat', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
