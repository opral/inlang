import './preview.css';
const query = new URLSearchParams(location.search);
const app = query.get('app') === 'parrot' ? 'parrot' : 'sherlock';
const theme = query.get('theme') ?? 'dark';
const fixture = query.get('fixture') ?? 'normal';
document.getElementById('preview-controls')!.innerHTML = `<nav aria-label="Preview controls"><label>App <select name="app"><option value="sherlock">Sherlock</option><option value="parrot">Parrot</option></select></label><label>Theme <select name="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="contrast">High contrast</option></select></label><label>State <select name="fixture"><option value="normal">Description</option><option value="empty">Empty</option><option value="long">Long text</option><option value="error">Save failure</option></select></label><output role="status">Host bridge mocked · changes stay local</output></nav>`;
for (const select of document.querySelectorAll<HTMLSelectElement>('#preview-controls select')) {
  if (select.name === 'theme' && app === 'parrot') select.querySelector<HTMLOptionElement>('[value="contrast"]')!.disabled = true;
  select.value = select.name === 'app' ? app : select.name === 'theme' ? theme : fixture;
  select.addEventListener('change', () => { query.set(select.name, select.value); location.search = query.toString(); });
}
const storageKey = `inlang-ui-check:${app}:${fixture}`;
let hostState: unknown;
(window as any).acquireVsCodeApi = () => ({
  getState: () => hostState,
  setState: (value: unknown) => { hostState = value; return value; },
  postMessage: (message: any) => {
    const storedBundle = (window as any).previewBundle;
    if (message.command === 'ready') window.postMessage({ command: 'change', data: { bundle: storedBundle, settings: { baseLocale: 'en', locales: ['en', 'de', 'fr'], modules: [] } } }, '*');
    if (message.command === 'apply-changes') {
      if (fixture === 'error') {
        window.postMessage({ command: 'change', reset: true, data: { bundle: storedBundle, settings: { baseLocale: 'en', locales: ['en', 'de', 'fr'], modules: [] } } }, '*');
        document.querySelector('#preview-controls output')!.textContent = 'Simulated save failure · host returned stored bundle';
        return;
      }
      const change = message.changes.find((change: any) => change.entity === 'bundle');
      if (change) localStorage.setItem(storageKey, JSON.stringify(change.newData.description));
      document.querySelector('#preview-controls output')!.textContent = 'Received editor change · local preview';
    }
  },
});
const defaultDescription = fixture === 'empty' ? null : fixture === 'long'
  ? 'Final checkout button. Confirms payment immediately. Use an action verb and keep it short.\n\nThis description applies to every language, including translations that have not been added yet. Preserve the intended payment meaning.\n\nLong labels and guidance should wrap within the editor without pushing actions outside the panel.'
  : 'Final checkout button. Confirms payment immediately. Use an action verb and keep it short.';
const saved = localStorage.getItem(storageKey);
const bundle = {
  id: 'checkout_submit', declarations: [], description: saved === null ? defaultDescription : JSON.parse(saved),
  messages: ['en', 'de', 'fr'].map((locale, index) => ({
    id: `checkout_${locale}`, bundle_id: 'checkout_submit', locale, selectors: [],
    variants: [{ id: `checkout_${locale}_v`, message_id: `checkout_${locale}`, matches: [], pattern: [{ type: 'text', value: ['Place order', 'Jetzt kaufen', 'Commander'][index] }] }],
  })),
};
(window as any).previewBundle = bundle;
if (app === 'parrot') await (await import('./parrot')).mount(bundle, theme, storageKey);
else await (await import('./sherlock')).mount(bundle, theme);
