# Installing Mind Power Games in Chrome

The project folder **is** the extension. Chrome loads it directly - there is no
build step, no npm install, no compiling.

---

## Load it (takes 30 seconds)

1. Open Chrome and go to:

   ```
   chrome://extensions
   ```

2. Turn on **Developer mode** - the toggle in the **top-right** corner.
   (Without this, the buttons in step 3 do not appear.)

3. Click **Load unpacked** - top-left.

4. In the folder picker, select this exact folder:

   ```
   D:\Company\Mind Power Games
   ```

   Select the folder itself - do **not** open it and pick `manifest.json`,
   and do **not** pick the `dist` folder.

5. The card "Mind Power Games 1.0.0" appears. Click the puzzle-piece icon in the
   Chrome toolbar and **pin** it so the icon stays visible.

6. Click the icon. **Start Brain Test** runs all seven games in a row (about 12
   minutes) and ends with your Brain Profile. The tiles below let you practise any
   single game. Everything opens in a full tab.

---

## After you change the code

Chrome does **not** auto-reload an unpacked extension.

- Changed a **game, CSS or JS file**? Just close and reopen the game tab.
- Changed **manifest.json**, or added a new file? Go to `chrome://extensions`
  and click the **circular reload arrow** on the extension card.

If something looks stale, reload the card - it is the safe answer either way.

---

## Check it before loading (optional)

This catches the mistakes that make Chrome reject an extension - a broken
manifest, a missing icon, an inline `onclick`, a bad import path:

```bash
npm run validate
```

It prints `Ready to load unpacked` or a list of exactly what to fix.

---

## Make a ZIP (for sharing or the Web Store)

You do **not** need this to use the extension yourself. Use it to send the
extension to someone or to publish it:

```bash
npm run build
```

There is no compile step - this validates the extension, then writes `dist\mind-power-games-v<version>.zip`
containing only the runtime files, with `manifest.json` at the top level - the
structure the Chrome Web Store requires.

> Note: a ZIP **cannot** be dragged onto `chrome://extensions`. Chrome only
> accepts an unpacked folder there. Anyone you send the ZIP to must unzip it
> first, then use **Load unpacked** on the unzipped folder.

---

## Publishing to the Chrome Web Store

1. Register as a developer at
   <https://chrome.google.com/webstore/devconsole> (one-time $5 fee).
2. Upload `dist\mind-power-games-v<version>.zip`.
3. You will also need to supply:
   - at least one **screenshot** at 1280x800 or 640x400,
   - a short description (the manifest one is reused as a starting point),
   - a privacy justification for the `storage` permission. The honest answer:
     *scores and streaks are stored locally on the user's own machine; no data
     is collected, transmitted or shared.*
4. Bump `"version"` in `manifest.json` for every new upload - the Web Store
   rejects a repeat version. Re-run `npm run build` and the filename follows
   the new version automatically.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| "Manifest file is missing or unreadable" | You picked the wrong folder. Pick the folder that directly contains `manifest.json`. |
| **Load unpacked** button is not there | Developer mode is off (top-right toggle). |
| Extension loads but the icon is grey/blank | Reload the card; if it persists, run `npm run validate` to check the icon files. |
| Popup opens but is empty | Right-click the popup > **Inspect** and read the Console tab. |
| A game tab is blank | Open DevTools (F12) on that tab; a failed module import shows in the Console. |
| Scores vanished | Scores live in `chrome.storage.local`, tied to this extension. Removing and re-adding the extension clears them. |
| Changes not showing | Reload the extension card, then reopen the tab. |

---

## What this extension can and cannot do

The manifest asks for two permissions: **`storage`**, to keep your scores, test
sessions and streak on your own machine, and **`unlimitedStorage`**, so detailed
per-trial results are never discarded for lack of space (it shows no install
warning).

It requests no host permissions, so it cannot read, change or even see any web
page you visit. It has no background service worker, no network calls, and no
analytics - nothing leaves your computer.
