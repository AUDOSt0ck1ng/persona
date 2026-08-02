# Developing Persona

## Architecture

Persona has four intentionally narrow layers:

1. Native listeners discover a supported voice process and calculate a
   normalized output level.
2. The Electron main process owns lifecycle, window behavior, tray commands,
   URL handling, the local adapter, and Persona's MCP controls.
3. The sandboxed preload exposes only normalized Persona events and narrow
   settings operations.
4. React and Three.js render the model, blend VRMA motion, and drive VRM
   expressions.

No renderer code has filesystem, process, or raw-audio access.

## Settings and local media

`public/assets/library.json` declares the immutable library shipped with the
application. It contains packaged models plus animation action names,
descriptions, trigger scenarios, runtime types, and media paths. The release asset validator
derives its expected media from this catalog instead of a second hard-coded
list.

The active catalog publishes the default model plus the permanent Idle and
Speaking action slots and their bundled motion files. Users can replace that
model or extend the animation library from Settings.
`library.json.example` and `manifest.json.example` are complete, directly
copyable examples for the ignored local test media. Packaged models live under
`public/assets/models/` and animations under `public/assets/animations/`. When
a non-empty catalog omits an explicit default, its first model becomes active.

`electron/settings-store.cjs` owns the mutable per-user library and merges it
with the packaged catalog. Animation actions and their VRMA clips are separate
records: an action owns MCP metadata and can contain multiple numbered clips.
The renderer sends metadata through the sandboxed preload, the main process
opens the native multi-file picker, validates every selected glTF 2 binary, and
copies it under Electron's per-user application-data directory.

User media is exposed to renderers through the locked `persona-asset:`
protocol. Requests resolve only IDs already present in the settings store; a
renderer cannot turn the protocol into an arbitrary local-file reader.

Packaged files are never mutated. Editing packaged action metadata creates a
copy-on-write override, and removing one creates a user-level visibility
tombstone. Resetting packaged actions clears only those overrides and
tombstones; user-created actions and uploaded clips remain unchanged. Idle and
Speaking cannot be edited or removed, but users can add or remove their local
clips.

The store returns one active snapshot containing the default model, character
size, merged model records, merged action records with clip collections, and the
configured voice source. Only actions with at least one playable clip appear in
the MCP tool description and animation listing. Catalog changes refresh
connected MCP sessions immediately, while every animation request is validated
against the current store snapshot. Keep the catalog, store, MCP, and
asset-contract tests in sync when adding fields or changing validation.

An empty packaged catalog is a supported first-run state. The application opens
Settings and does not create the avatar window or start the audio listener until
the merged snapshot has a valid `default_model_id`. Importing the first user
model selects it automatically. Empty Idle or Speaking actions use an empty
animation URL list, which leaves the VRM in its normal pose.

### Modular speaking motion

When Speaking has multiple clips, the renderer treats them as conversational
motion chunks. Each clip plays once, a non-repeating successor is selected at
random, and the body crossfades between them while the speaking state remains
active. Speaking chunks use a normalized 900 ms blend. The persisted
`speaking_transition.entry_factor` and `speaking_transition.exit_factor`
settings scale the duration of the incoming and outgoing halves independently;
their defaults are `4` and `1`. A factor of `1` is 450 ms per half, `0.1` is
45 ms, and `8` is 3.6 seconds. The weights always sum to one, preventing the
model's rest pose from leaking through. Lip sync
continues to follow the live output level independently. A
short voice pause therefore stops the mouth without interrupting the current
body sequence.

The values are stored in Persona's per-user `settings.json` as:

```json
"speaking_transition": {
  "entry_factor": 4,
  "exit_factor": 1
}
```

They can also be changed from Appearance in the Settings window. Valid factors
range from `0.1` to `8`.

## MCP contract

`electron/mcp-server.cjs` owns the Codex-facing tool schemas and translates
validated tool calls into narrow main-process callbacks. It does not receive
the Electron application object, renderer access, arbitrary animation paths, or
shell execution.

The loopback server creates a stateful Streamable HTTP transport when a client
initializes an MCP session, then routes subsequent `POST`, `GET`, and `DELETE`
requests by session ID. Active sessions receive tool-list change notifications
when the playable action catalog changes. New sessions always discover the
latest catalog, and `play_animation` checks the live store again when invoked.
MCP shares the existing local integration port rather than opening another
listener.

When extending the server:

- prefer a small product action over exposing an internal Electron primitive;
- validate every argument with a bounded schema and, where applicable, the
  current settings catalog;
- mark read-only and side-effecting tools accurately;
- keep the server instructions self-contained; and
- add a protocol-level client test for discovery, valid calls, and rejected
  input.

## Listener contract

All operating systems implement:

- `onSession(active)` for coarse lifecycle;
- `onActivity("listening" | "speaking")`;
- `onLevel(0..1)` for lip movement; and
- `onStatus(...)` for diagnostics.

`AudioActivityGate` owns the shared short-silence behavior. Lips follow every
level immediately. The activity gate holds speaking for 250 ms of silence, and
the renderer waits another 250 ms before returning the body to idle. This keeps
brief word gaps continuous without extending conversational motion far into a
real pause.

Voice-source validation and stable identities are shared through
`electron/voice-source.cjs`; discovery lives in
`electron/voice-source-discovery.cjs`. Settings supports automatic detection,
an exact application or PipeWire stream, an advanced regex, and external event
mode. `PERSONA_TARGET_PROCESS_PATTERN` overrides automatic and advanced
matching when set. Every source change recreates the listener immediately.

Linux persists a composite PipeWire stream identity so generic application
names such as `Electron` cannot collapse unrelated playback streams. macOS and
Windows persist executable identity and resolve the current process tree before
starting the native helper. PIDs and PipeWire object serials are never stored.

Linux implements the contract directly with PipeWire commands. macOS and
Windows helpers write newline-delimited JSON to stdout:

```json
{"type":"ready","source":"Windows process audio"}
{"type":"level","level":0.21}
```

## Commands

```bash
npm run lint
npm test
npm run assets:check
npm run build
npm run native:build
npm run native:test
```

`npm run check` runs the platform-neutral checks together.

The native build command:

- does nothing on Linux because the runtime uses installed PipeWire commands;
- compiles Objective-C++ against Core Audio on macOS; and
- locates Visual Studio Build Tools and compiles C++ against WASAPI on Windows.

Linux packaging detects NixOS and runs `fpm` from `nixpkgs#fpm`, avoiding the
upstream bundled FPM wrapper's `/bin/bash` assumption. Other distributions use
electron-builder's bundled packaging tool.

## Test coverage

The Node suite covers settings persistence and imported-media boundaries, MCP
discovery and tool calls, the bridge boundary, URL protocol, Hyprland rules,
PipeWire selection and PCM normalization, process discovery on macOS and
Windows, native NDJSON parsing, shared pause smoothing, listener lifecycle,
asset safety, and release checksums.

Vitest covers animation priority and configured animation selection. GitHub
Actions then compiles and self-tests the native helper on its real operating
system and builds the renderer on all three platforms.

Headless CI cannot create a real Codex voice call or approve operating-system
audio permissions. Before a release, manually run the checklist in
[RELEASING.md](RELEASING.md) on each platform.

## Native API references

- Apple: [Capturing system audio with Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)
- Microsoft: [Application loopback audio capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
