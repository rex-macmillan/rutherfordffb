# Sleeper Keeper Helper

This web application helps fantasy football managers in a Sleeper league determine which players they can keep for the upcoming season and what draft round they will cost.

## Features

* Fetches league, roster, and past-season draft information directly from the public Sleeper API.
* Calculates each player’s *keeper round* (one round earlier than the round they were drafted last season).
* Lets each manager select up to **four** keepers.

## Getting Started

1. **Install dependencies**

```bash
pnpm i # or npm install / yarn install
```

2. **Run the dev server**

```bash
pnpm dev
```

Open <http://localhost:3000> in your browser to view the app.

3. **Build for production**

```bash
pnpm build && pnpm start
```

## Deployment

The project is a standard Next.js application. You can deploy it to any platform that supports Node.js—Vercel, Netlify, Render, AWS, etc. Simply set the build command to `npm run build` and the start command to `npm start`.

## Configuration

No API keys are necessary because the Sleeper API is public & read-only. If you hit rate limits you may need to cache responses on your own backend.

## License

MIT 