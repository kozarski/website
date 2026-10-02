# Fonts

Local copies of the site's fonts. The original download links and checksums are
in [sources.json](sources.json). Comico sits in [sandwich/fonts](../sandwich/fonts/)
so that page can still be opened directly. The blog keeps its fonts in
[blog/src/fonts](../blog/src/fonts/).

Each page preloads the fonts it needs. Once the homepage has loaded, it also
downloads Tanker for the Projects page. Hovering or focusing links on those two
pages gives the next page's fonts a head start too. Background downloads are
skipped on data-saving connections and hidden tabs. Text stays visible while
fonts load.

## Replacing a font

Give the file a new hash in its filename, then update its CSS, HTML preloads,
[font-loading.js](../js/font-loading.js) and [sources.json](sources.json).
Add the new path to the Cloudflare rule as well.

Cloudflare's **Site font caching** rule allows a year of browser caching and
30 days at Cloudflare for the listed font files. It only applies to successful
responses. The rule is managed in Cloudflare; [this JSON file](../config/cloudflare-font-cache.json)
keeps a copy of the settings.

To undo the cache change, disable the rule and purge the affected font URLs.
That won't clear copies already in visitors' browsers, which is why changed
fonts need new filenames.

## Credits and licenses

The font files are unchanged from their original downloads.

- Zodiak, Tanker, Aktura and Comico: Copyright Indian Type Foundry. All rights
  reserved. [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl).
- JetBrains Mono: [JetBrains Mono project](https://github.com/JetBrains/JetBrainsMono),
  downloaded from Fontshare. [SIL Open Font License](licenses/jetbrains-mono-OFL.txt).
- Press Start 2P and Space Mono: downloaded from Google Fonts, keeping the
  original language subsets. SIL Open Font License:
  [Press Start 2P](licenses/press-start-2p-OFL.txt) and [Space Mono](licenses/space-mono-OFL.txt).
