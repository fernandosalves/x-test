import type { Preview } from '@storybook/html';

const preview: Preview = {
    parameters: {
        layout: 'fullscreen',
        backgrounds: {
            default: 'light',
            values: [
                { name: 'light', value: '#f8fafc' },
                { name: 'dark',  value: '#0f172a' },
            ],
        },
        docs: { toc: true },
    },
};

export default preview;
