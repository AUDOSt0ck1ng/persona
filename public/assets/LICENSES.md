# Persona asset licenses

The MIT License in the repository root applies to Persona's source code. It
does not grant rights to character models, animations, textures, environments,
or other media located under `public/assets/`. Those files are governed by the
terms documented here and in `manifest.json`.

## Repository artwork

`avatar.png` is Persona's application icon. `demo.jpg` is the product preview
shown in the repository README.

Both files are excluded from the repository's MIT License. Their provenance and
reuse terms have not yet been documented here, so this file does not grant
permission to reuse or redistribute either file independently.

## Bundled environment

Persona includes the `dawn.exr` environment from `@pmndrs/assets`. The asset
collection is published under CC0 1.0 and sources its HDR environments from
Poly Haven.

## Character models and animations

VRM and VRMA files are intentionally ignored by Git unless they have been
explicitly cleared for distribution. Each distributed model or animation must
be listed below with its title, creator, source, license, required attribution,
and any applicable restrictions. The same asset must also have complete
license and source fields in `manifest.json`.

No character models or animations are currently licensed for distribution as
part of this repository.

Local files without a verified redistribution license are development inputs
only. Therefore:

- do not publish unverified files in a source repository;
- do not attach a package containing them to a release;
- do not represent the MIT License as covering them; and
- do not set `distributionAllowed` to `true` for these files.

The automated release gate enforces the last two requirements, but repository
authors remain responsible for not committing restricted files.

`library.json.example` and `manifest.json.example` describe the current ignored
local test files for development. They do not grant distribution rights; the
example manifest intentionally leaves distribution disabled and license
provenance incomplete.

## Adding distributable assets

Declare packaged media and its product metadata in `library.json`. Then mirror
every declared media path in `manifest.json`:

1. Add the asset to this file with its title, creator, source, license,
   attribution, and restrictions.
2. Set its manifest `license` to an SPDX identifier or clear license name.
3. Set its manifest `source` to a public source or author-provided provenance.
4. Confirm that its terms permit redistribution in Persona.
5. Set `distributionAllowed` to `true`.
6. Run `npm run assets:release`.
