# Releasing Cookbook

The desktop app updates itself from this repository's GitHub releases. Every
update is signed, and the app refuses anything not signed with the project's
key, so only someone holding that key can ship an update.

The browser version needs none of this: it updates whenever the site is
redeployed, and shows the same “A new version of Cookbook is ready” prompt.

## Once: make the signing key

You need Node.js on your own computer: version 22 or newer (any current version is fine).

1. Make a key pair, with a password you will remember:

   ```sh
   npx @tauri-apps/cli signer generate -w ~/.tauri/cookbook.key
   ```

   This writes the private key to `~/.tauri/cookbook.key` and the public key
   to `~/.tauri/cookbook.key.pub`.

2. Keep the private key safe and private. Back it up somewhere other than this
   computer, such as a password manager. **If it is lost, installed copies of
   Cookbook can never be updated again**: people would have to download the
   app by hand. Never commit it or paste it anywhere public.

3. In the repository on GitHub, open Settings → Secrets and variables →
   Actions, and add two repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`: the whole contents of `cookbook.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

4. Put the public key (the contents of `cookbook.key.pub`, which is safe to
   share) in `src-tauri/tauri.conf.json`, in place of
   `REPLACE_WITH_THE_PUBLIC_KEY_FROM_npx_tauri_signer_generate`, and commit it.

## Each release

1. Set the version everywhere at once, then commit and merge it:

   ```sh
   npm run set-version -- 0.1.0
   npm install
   cargo check --manifest-path src-tauri/Cargo.toml
   ```

2. Tag the merged commit on `main`. The tag's message becomes the release
   notes the app shows under “What’s new”:

   ```sh
   git tag -a v0.1.0 -m "Spelling, grammar and style checks, right on your device."
   git push origin v0.1.0
   ```

   Or skip the terminal: on GitHub, open **Actions › Release › Run workflow**,
   leave the branch on `main`, write the notes, and run it. The tag is made
   from the version on `main` when you publish the draft.

3. The Release workflow builds and signs the app for macOS (Apple silicon and
   Intel), Windows and Linux (AppImage, .deb and .rpm), and uploads them, with
   `latest.json` for the updater, to a **draft** release.

4. Check the draft on GitHub, then publish it. Only then do installed copies
   see the update: each checks a few seconds after opening and every six
   hours, and asks before installing. It saves the writer's work first.

## What updates itself

| Download | Updates itself |
| --- | --- |
| macOS `.dmg` / `.app` | Yes |
| Windows `.msi` and `-setup.exe` | Yes |
| Linux `.AppImage` | Yes |
| Linux `.deb` and `.rpm` | Yes, asking for the admin password to install |

## Not covered yet

The update signature proves an update came from this project. It is separate
from Apple's and Microsoft's own code signing, which stops macOS Gatekeeper
and Windows SmartScreen warning on the first install. Those need paid
developer accounts and can be added to the Release workflow later.

Until then the Mac app is signed ad hoc (`signingIdentity: "-"`), which Apple
silicon Macs need to run it at all. The first time it is opened, macOS says it
can't check the app for malware. To open it anyway:

1. Drag Cookbook from the `.dmg` to Applications and open it once. Click **Done**.
2. Open **System Settings › Privacy & Security**, scroll down, and click
   **Open Anyway** next to the message about Cookbook. Confirm with your password.

After that it opens normally, and updates install without asking again.
On Windows, SmartScreen may say it protected your PC: click **More info**,
then **Run anyway**.
