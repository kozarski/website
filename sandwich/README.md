# World’s Best Sandwich

your sandwich, your way. stack it up.

## Development

From the repository root:

```sh
npm ci
npm run dev:sandwich
```

Open http://127.0.0.1:4173/sandwich/. Refresh after changes.

## Build and check

```sh
npm ci --prefix blog
npm run build
npm run check
npm run test:sandwich
```

The website is built into `_final_site`. To build only the playground, run
`npm run build:sandwich`; `sandwich/index.html` can then be opened directly
in Safari with its accompanying assets.

For the performance benchmark, run `npm run review:sandwich-performance`
and open `/sandwich/tests/performance.html` with the development server running.
