import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Website Audit Agent',
    description: 'AI-Powered Website Audit Chrome Extension',
    version: '0.1.0',
    permissions: [
      'activeTab',
      'storage',
      'sidePanel',
      'scripting',
      'tabs',
      'alarms'
    ],
    optional_host_permissions: [
      'https://*/*',
      'http://*/*'
    ],
    host_permissions: [
      'http://127.0.0.1:8000/*',
      'http://localhost:8000/*'
    ]
  },
});