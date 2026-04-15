# Readibly

Readibly is a production-style Chrome extension that uses the Side Panel API to turn dense legal agreements into clear, structured insights.

## Stack

- Manifest V3
- TypeScript
- React
- Chrome Side Panel API
- Modular background, content script, shared types, and UI layers

## Features

- Premium editorial onboarding screen
- Local-first scan flow with placeholder analysis
- Smooth fade and slide transitions
- Reusable React components
- Side panel navigation for Summary, Chat, and Settings

## Setup

1. Install dependencies:

   npm install

2. Build the extension:

   npm run build

3. Load the generated dist folder in Chrome:

   - Open chrome://extensions
   - Enable Developer mode
   - Choose Load unpacked
   - Select the dist directory

## Development

- Run npm run dev to rebuild on file changes.
- Run npm run typecheck to validate TypeScript.

## Notes

- The scan flow currently uses a placeholder result model that reads the active page context.
- The close control is stubbed because the Side Panel API does not expose a direct close action from the panel UI.
- Fonts are bundled with @fontsource so the UI keeps the intended Manrope and Inter styling without external font links.
