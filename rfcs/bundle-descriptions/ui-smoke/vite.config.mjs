import react from '../../../../inlang-fink/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
export default {
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: workspace + 'inlang-fink/node_modules/react/index.js' },
      { find: /^react\/(.*)$/, replacement: workspace + 'inlang-fink/node_modules/react/$1' },
      { find: /^react-dom$/, replacement: workspace + 'inlang-fink/node_modules/react-dom/index.js' },
      { find: /^react-dom\/(.*)$/, replacement: workspace + 'inlang-fink/node_modules/react-dom/$1' },
      { find: /^@inlang\/sdk(?:\/browser)?$/, replacement: workspace + 'inlang/packages/sdk/dist/browser.js' },
      { find: /^@inlang\/editor-component$/, replacement: workspace + 'inlang/packages/ui-components/editor-component/dist/index.js' },
      { find: /^@lix-js\/sdk$/, replacement: workspace + 'sherlock-descriptions/src/utilities/editor/sherlock-editor-app/src/lib/lixStub.ts' },
    ],
    dedupe: ['react', 'react-dom', 'lit', '@inlang/sdk', '@inlang/editor-component'],
  },
  build: { target: 'es2022', outDir: '.preview-build', rollupOptions: { input: { index: fileURLToPath(new URL('./index.html', import.meta.url)), compare: fileURLToPath(new URL('./compare.html', import.meta.url)) } } },
  server: { host: '127.0.0.1', port: 5182, fs: { allow: [workspace] } },
  preview: { host: '127.0.0.1', port: 5182 },
};
