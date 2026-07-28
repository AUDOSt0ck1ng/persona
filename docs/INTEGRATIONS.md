# Persona integrations

Persona accepts small state and level messages from local voice experiences.
The character renderer never needs raw audio, transcripts, prompts, credentials,
or host-application internals.

The bundled Codex and ChatGPT integration uses native process-scoped output
listeners because those applications do not currently expose a supported
cross-process realtime voice event stream. If an official event stream becomes
available, it can map to the same contract without changing Persona's window or
animation system.

## Codex MCP server

Persona serves a Streamable HTTP MCP endpoint while the app is running. Add it
to Codex once:

```bash
codex mcp add persona --url http://127.0.0.1:47831/mcp
```

Start a new Codex session after registering the server. You can inspect the
saved connection with:

```bash
codex mcp get persona
```

Persona exposes these tools:

| Tool | Input | Effect |
| --- | --- | --- |
| `play_animation` | `animation`: `idle`, `greeting`, `talk`, `celebrate`, or `dance` | Shows Persona and plays an installed animation |
| `control_window` | `action`: `show`, `hide`, or `toggle` | Controls the Persona window without quitting the app |
| `get_status` | None | Reads window visibility, voice state, and listener status |

The animation names are a stable product contract rather than file paths.
Future character packs can replace the media behind those names without
changing the MCP configuration or granting filesystem access.

The MCP endpoint uses the same port as the local HTTP API. If
`PERSONA_BRIDGE_PORT` changes it, update the URL registered with Codex to match.

## Automatic listeners

### Linux

Persona polls the PipeWire graph for a Codex or ChatGPT playback node. It
attaches `pw-record` to that one stream, calculates RMS amplitude in memory, and
discards every sample after calculation. The stream remains connected to its
normal output device.

### Windows

The native helper uses WASAPI application loopback with
`PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`. Audio from other
applications is excluded. Persona supports Windows 10 build 20348 and newer.

### macOS

The native helper creates a private, unmuted Core Audio process tap and private
aggregate device for the selected voice process. Persona supports macOS 14.2
and newer and declares why it requests System Audio Recording permission.

Set `PERSONA_TARGET_PROCESS_PATTERN` to a case-insensitive regular expression
to target another desktop voice application:

```bash
PERSONA_TARGET_PROCESS_PATTERN='my-voice-app' persona
```

## URL protocol

Installed packages register `persona://`.

| URL | Effect |
| --- | --- |
| `persona://show` | Show and focus Persona |
| `persona://hide` | Hide Persona without quitting |
| `persona://toggle` | Toggle visibility |
| `persona://listening` | Begin a listening state |
| `persona://thinking` | Settle the character while a response is prepared |
| `persona://speaking?level=0.3` | Begin speaking and optionally set a level |
| `persona://inactive` | End the voice state without hiding Persona |
| `persona://greeting` | Preview the greeting motion |
| `persona://celebrate` | Preview a celebration motion |
| `persona://dance` | Preview a dance motion |

Open these URLs with `xdg-open` on Linux, `open` on macOS, or `start` on
Windows.

## Loopback HTTP API

Persona listens on `127.0.0.1:47831` by default. Override the port with
`PERSONA_BRIDGE_PORT`. Native clients may omit `Origin`; browser clients are
restricted to trusted local and supported app origins. Requests with a
non-loopback `Host` are rejected.

Voice state:

```json
{
  "type": "state",
  "state": {
    "phase": "active",
    "activity": "speaking",
    "microphoneMuted": false,
    "outputMuted": false
  }
}
```

Allowed phases are `inactive`, `starting`, `active`, and `stopping`. Allowed
activities are `idle`, `listening`, and `speaking`.

Normalized level:

```json
{
  "type": "audio-level",
  "level": 0.31
}
```

Animation preview:

```json
{
  "type": "animation",
  "animation": "DANCE"
}
```

Allowed animations are `IDLE`, `GREETING`, `TALK`, `CELEBRATE`, and `DANCE`.

Send events:

```bash
curl -H 'Content-Type: application/json' \
  --data '{"type":"state","state":{"phase":"active","activity":"speaking","microphoneMuted":false,"outputMuted":false}}' \
  http://127.0.0.1:47831/events
```

`GET /health` reports whether Persona is running and returns the last state. It
does not expose user content.
