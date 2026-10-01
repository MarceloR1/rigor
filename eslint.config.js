import prettier from 'eslint-config-prettier';

export default [
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                performance: 'readonly',
                requestAnimationFrame: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                localStorage: 'readonly',
                location: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
        },
    },
    {
        files: ['js/renderer3d.js'],
        languageOptions: {
            globals: {
                URLSearchParams: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
    prettier,
];
