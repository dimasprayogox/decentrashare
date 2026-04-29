import typography from '@tailwindcss/typography';
import forms from '@tailwindcss/forms';
import type { Config } from 'tailwindcss';

export default {
    content: [
        './src/**/*.{html,js,svelte,ts}',
        './src/routes/**/*.{svelte,ts}',
        './src/routes/**/*.{html,js,svelte,ts}',
        './src/lib/**/*.{svelte,ts}'
    ],

    theme: {
        extend: {}
    },

    plugins: [
        typography,
        forms,
    ]
} as Config;