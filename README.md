# dsh-ding

Native notification and a short chime when a DeepSeek Harness task finishes.

## What it does

- Watches every top-level session through the Web client's live session-status
  projection.
- When a session stops running after having been running, it shows one system
  notification titled **Task finished** with the session title, and plays a
  short two-tone chime.
- Clicking the notification opens that session and asks the app window to come
  forward; the operating system activates DeepSeek Harness when the
  notification is clicked.
- No alert is shown when you are already viewing that session in a focused,
  visible window. Hidden-to-tray, minimized, background, and other-session
  completions still alert.
- Subagent sessions are ignored.

## How it works

The bundle has an inert Host half and a Client half. The Client half reads
`ctx.uiSession.sessionStatus` (the projection that already follows Host
`api-session/status` events), registers one headless entry in the frame-wide
`shell.overlay` slot, and converts a running → idle transition into a
notification plus a WebAudio chime. No session events are written, no model
request is made, and no data leaves the machine.

## Limitations

- One alert per running interval: steering and follow-ups that share the
  interval produce a single alert at the end.
- The client status stream does not say whether a stop was completed, aborted,
  or failed, so the wording is the neutral **Task finished**.
- Background-job and subagent-internal completions do not alert by themselves;
  the session's turn end is the alert.
- The renderer must be alive. It survives closing the window to the tray, but
  not quitting the app.
- Banners need notification permission for DeepSeek Harness. If it is blocked,
  the chime still plays. macOS Do Not Disturb may hide the banner; the chime is
  independent of it.
- No settings UI in this version. Turn the plugin off in **Plugins** to
  disable it.

## Manual smoke test

Run this in the page console to fire one notification and chime immediately:

```js
document.dispatchEvent(new Event('dsh-ding:test'))
```

## Audition and tune the chime

Open `preview/chime.html` in a browser (from this directory: `open preview/chime.html`)
and play the presets. The page runs the same frequencies, durations, and
envelope as the plugin. The plugin's level is `CHIME_LEVEL` in `client.js`
(default `3.0`, i.e. 3× the original `0.115 / 0.055` tone gains); keep it at
or below `4` so the two tones cannot clip.

## Disable or remove

Use the row in **Plugins** to disable or remove the bundle. The overlay entry,
status subscription, and audio context are disposed with the plugin.
