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

## Default model

### AvatarSample_A

- File: `models/AvatarSample_A.vrm`
- Title: AvatarSample_A
- Creator: VRoid Project / pixiv Inc.
- Attribution: AvatarSample_A by VRoid Project / pixiv Inc.
- Source: [VRoid Hub model page](https://hub.vroid.com/en/characters/2843975675147313744/models/5644550979324015604)
- Terms: [VRoid sample-model conditions of use](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z)
- License scope: excluded from Persona's MIT License

The model's terms allow use, modification, commercial use, and redistribution;
attribution is not required, but Persona provides it above. The model is not
CC0. Its terms prohibit representing it as CC0, redistributing the model or its
contained data for a fee, using its data to develop or supply a character
creation service, implying pixiv endorsement, and the other prohibited conduct
listed in the linked conditions.

## Bundled animations

The following animation assets are distributed with Persona but are explicitly
excluded from the MIT License that applies to the source code:

### Idle

- `animations/idle.vrma`

### Speaking

- `animations/speaking-chunk00.vrma`
- `animations/speaking-chunk1.vrma` through `animations/speaking-chunk8.vrma`
- `animations/speaking-chunk11.vrma` through `animations/speaking-chunk88.vrma`
  using repeated-number names (`11`, `22`, and so on)

The repository's MIT License grants no rights to these animation files. No
separate reuse license is granted by this repository. Their original VRMA
metadata identifies exporter software but contains no creator, source URL,
copyright, or license information.

## Other character models and animations

VRM and VRMA files are intentionally ignored by Git unless they have been
explicitly cleared for distribution. Each additional distributed model or
animation must be documented with its title, creator, source, license, required
attribution, and any applicable restrictions. The same asset must also have
complete license and source fields in `manifest.json`.

Local files without a verified redistribution license are development inputs
only. Therefore:

- do not publish unverified files in a source repository;
- do not attach a package containing them to a release;
- do not represent the MIT License as covering them; and
- do not add them to the distributable manifest.

The automated release gate enforces the manifest boundary, but repository
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
