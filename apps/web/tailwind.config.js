/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Readex Pro"', 'system-ui', 'sans-serif'],
        display: ['"Baloo Bhaijaan 2"', '"Readex Pro"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // هوية "دفتر المعمل": ورق كريمي + حبر كوبالت + ليموني ومرجاني
        paper: { DEFAULT: '#FBF7EE', 50: '#FFFDF8', 100: '#F6F0E1', 200: '#ECE3CC' },
        ink: {
          50: '#F3F4F8', 100: '#E4E6EF', 200: '#C9CDDD', 300: '#9EA4BE', 400: '#6F7697',
          500: '#4D5476', 600: '#393F5E', 700: '#2A2F4A', 800: '#1D2138', 900: '#131629', 950: '#0B0D1B',
        },
        brand: {
          50: '#EEF1FF', 100: '#DDE3FF', 200: '#BBC6FF', 300: '#8E9FFF',
          400: '#6177FF', 500: '#3D55F5', 600: '#2B40D9', 700: '#2332AE',
          800: '#1F2C88', 900: '#1C286B', 950: '#121940',
        },
        lime: { 100: '#F4FCCF', 200: '#E9F99F', 300: '#DDF46B', 400: '#CDEB3C', 500: '#B3D11F', 700: '#5E6F0A' },
        coral: { 100: '#FFE7DF', 200: '#FFCBBB', 300: '#FFA68B', 400: '#FF835F', 500: '#F4643B', 600: '#D84A22', 700: '#A93817' },
        science: {
          green: '#2F9E6B', teal: '#1E9AA0', orange: '#F4643B',
          yellow: '#E8B321', purple: '#7B5CF0', pink: '#E0508A',
        },
      },
      borderRadius: {
        xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem', '4xl': '2.25rem',
      },
      boxShadow: {
        // ظل "مطبوع" مزاح بدل الظلال الضبابية
        stamp: '4px 4px 0 0 #131629',
        'stamp-sm': '2px 2px 0 0 #131629',
        'stamp-brand': '4px 4px 0 0 #2B40D9',
        soft: '0 18px 40px -24px rgba(19,22,41,0.35)',
        card: '0 1px 0 0 rgba(19,22,41,0.04), 0 10px 30px -20px rgba(19,22,41,0.25)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(61,85,245,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(61,85,245,0.07) 1px, transparent 1px)',
        dots: 'radial-gradient(rgba(19,22,41,0.14) 1px, transparent 1.2px)',
      },
      backgroundSize: {
        grid: '28px 28px',
        dots: '18px 18px',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        pop: { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        orbit: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        bubble: {
          '0%': { transform: 'translateY(0)', opacity: '0' },
          '20%': { opacity: '1' },
          '100%': { transform: 'translateY(-60px)', opacity: '0' },
        },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        pop: 'pop 0.25s ease-out',
        orbit: 'orbit 18s linear infinite',
        'orbit-slow': 'orbit 32s linear infinite',
        bubble: 'bubble 3s ease-in infinite',
      },
    },
  },
  plugins: [],
};
