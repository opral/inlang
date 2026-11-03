import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import InlangEditor from '../../../../parrot-descriptions/src/ui/views/messages/InlangEditor';
import { MessageSaveQueue } from '../../../../parrot-descriptions/src/lib/message/editor/MessageSaveQueue';
import { bundleToLegacyMessage } from '../../../../parrot-descriptions/src/lib/message/store/LegacyMessageBundleConverter';
import light from '../../../../parrot-descriptions/src/ui/figma_light.css?inline';
import dark from '../../../../parrot-descriptions/src/ui/figma_dark.css?inline';
import '../../../../parrot-descriptions/src/ui/ui.css';
import '../../../../parrot-descriptions/src/ui/views/messages/MessageView.css';
import '../../../../parrot-descriptions/src/ui/views/localizedlabelslist/LocalizedLabelsListView.css';

function Preview({ initial, storageKey }: { initial: any; storageKey: string }) {
  const [message, setMessage] = useState(initial);
  const queue = useRef<MessageSaveQueue>(undefined);
  if (!queue.current) queue.current = new MessageSaveQueue(initial, async (next) => {
    if (storageKey.endsWith(':error')) throw new Error('Preview: simulated save failure');
    localStorage.setItem(storageKey, JSON.stringify(next.nativeBundle?.description ?? null));
    setMessage(next);
    document.querySelector('#preview-controls output')!.textContent = 'Saved through message queue · local preview';
  });
  return <div className="message-group message-group-inlang">
    <div className="message-group-header"><div className="spacer" /><div className="message-group-header-element-symbol" /><div className="message-group-header-name"><div className="rowText">{message.id}</div></div></div>
    <InlangEditor message={message} locales={['en', 'de', 'fr']} baseLocale="en" saveQueue={queue.current} />
  </div>;
}
export function mount(bundle: any, theme: string, storageKey: string) {
  document.getElementById('host-theme')!.textContent = theme === 'light' ? light : dark;
  const figmaBundle = { ...bundle, messages: bundle.messages.map((message: any) => {
    const { bundle_id, ...rest } = message;
    return { ...rest, bundleId: bundle_id, variants: rest.variants.map((variant: any) => {
      const { message_id, ...value } = variant;
      return { ...value, messageId: message_id };
    }) };
  }) };
  createRoot(document.getElementById('root')!).render(<Preview initial={bundleToLegacyMessage(figmaBundle, true)} storageKey={storageKey} />);
}
