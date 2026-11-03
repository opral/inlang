import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../../sherlock-descriptions/src/utilities/editor/sherlock-editor-app/src/App';
import '../../../../sherlock-descriptions/src/utilities/editor/sherlock-editor-app/src/App.css';

export function mount(bundle: any, theme: string) {
  const dark = theme !== 'light';
  const contrast = theme === 'contrast';
  document.body.className = contrast ? 'vscode-high-contrast' : dark ? 'vscode-dark' : 'vscode-light';
  const colors: Record<string, string> = {
    'font-family': 'system-ui, sans-serif', 'font-size': '13px', 'editor-font-family': 'ui-monospace, monospace',
    foreground: dark ? '#d4d4d4' : '#333333', descriptionForeground: dark ? '#b3b3b3' : '#616161', disabledForeground: dark ? '#a0a0a0' : '#767676',
    'editor-background': contrast ? '#000000' : dark ? '#1f1f1f' : '#ffffff',
    'input-background': dark ? '#313131' : '#ffffff', 'input-foreground': dark ? '#cccccc' : '#333333', 'input-border': contrast ? '#ffffff' : dark ? '#555555' : '#bbbbbb',
    'panel-border': dark ? '#414141' : '#dddddd', 'editorGroup-border': dark ? '#414141' : '#dddddd',
    'editorWidget-background': dark ? '#252526' : '#f3f3f3', 'editorWidget-border': dark ? '#555555' : '#cccccc',
    focusBorder: contrast ? '#ffff00' : '#007acc', 'textLink-foreground': dark ? '#75beff' : '#006ab1', 'textLink-activeForeground': dark ? '#75beff' : '#006ab1',
    'button-secondaryBackground': dark ? '#3a3d41' : '#e5e5e5', 'button-secondaryForeground': dark ? '#ffffff' : '#333333', 'button-secondaryHoverBackground': dark ? '#45494e' : '#d5d5d5',
    'button-background': '#0078d4', 'button-foreground': '#ffffff', 'button-hoverBackground': '#006cbe',
    'list-hoverBackground': dark ? '#2a2d2e' : '#eeeeee', 'list-inactiveSelectionBackground': dark ? '#37373d' : '#e4e6f1',
    'textCodeBlock-background': dark ? '#292929' : '#f4f4f4', 'toolbar-hoverBackground': dark ? '#333333' : '#eeeeee',
    'editorWarning-foreground': dark ? '#cca700' : '#9a6700', 'badge-background': dark ? '#4d4d4d' : '#dddddd', 'badge-foreground': dark ? '#ffffff' : '#333333',
  };
  if (contrast) colors.contrastBorder = '#ffffff';
  document.getElementById('host-theme')!.textContent = ':root{' + Object.entries(colors).map(([key, value]) => `--vscode-${key}:${value}`).join(';') + '}';
  createRoot(document.getElementById('root')!).render(<App />);
}
