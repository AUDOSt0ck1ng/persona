# Persona asset licenses

The MIT license covers Persona's application source. It does not grant rights
to the VRM or VRMA files under `public/assets/`.

## Bundled environment

Persona includes the `dawn.exr` environment from `@pmndrs/assets`. The asset
collection is published under CC0 1.0 and sources its HDR environments from
Poly Haven.

## Local development media

VRM and VRMA files are intentionally ignored by Git. Any local files without a
verified redistribution license are development inputs only. Therefore:

- do not publish unverified files in a source repository;
- do not attach a package containing them to a release;
- do not represent the MIT license as covering them; and
- do not set `distributionAllowed` to `true` for these files.

The automated release gate enforces the last two requirements, but repository
authors remain responsible for not committing restricted files.

`public/assets/library.json.example` and
`public/assets/manifest.json.example` describe the current ignored local test
files for development. They do not grant distribution rights; the example
manifest intentionally leaves distribution disabled and license provenance
incomplete.

## Replacing assets

Declare the packaged media and its product metadata in
`public/assets/library.json`. Then mirror every declared media path in
`public/assets/manifest.json`:

1. Set each asset's `license` to its SPDX identifier or clear license name.
2. Set each asset's `source` to a public source or author-provided provenance.
3. Confirm the license permits redistribution in this application.
4. Set `distributionAllowed` to `true`.
5. Run `npm run assets:release`.

If an asset requires attribution, add the complete attribution to this file
before release.
