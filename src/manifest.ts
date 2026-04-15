import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Readibly',
  description: 'Summarize legal agreements with a premium editorial side panel.',
  version: '0.1.0',
  action: {
    default_title: 'Readibly'
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  side_panel: {
    default_path: 'sidepanel.html'
  },
  permissions: ['sidePanel', 'storage', 'tabs'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    }
  ]
});
