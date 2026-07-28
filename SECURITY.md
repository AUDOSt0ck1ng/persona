# Security

## Reporting

Before the public repository exists, report security issues privately to the
maintainer. After `xikhar/persona` is created, use GitHub private vulnerability
reporting rather than a public issue.

## Data boundary

Persona's automatic listeners calculate a numeric output level in memory. They
do not capture the microphone, write audio to disk, transcribe it, or send it
over the network.

The integration server binds only to `127.0.0.1`, limits request bodies, and
accepts only normalized state, level, and animation events. The renderer is
sandboxed with context isolation and no Node.js integration. A restrictive
content security policy is applied, renderer popups are denied, and navigation
outside the local renderer entry is blocked.

## Supported versions

Until the first public release, only the current source revision is supported.
