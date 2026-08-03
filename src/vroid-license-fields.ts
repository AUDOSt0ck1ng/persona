export interface VroidLicenseRow {
  label: string;
  value: string;
}

// Labels mirror VRoid Hub's own conditions-of-use wording, per its developer
// guidelines for displaying model data conditions of use in a linked app.
// VRM 0.0 models expose these as a top-level `license` object; VRM 1.0
// models use an entirely different (camelCase, differently-valued) set of
// fields on vrm_meta directly — see VROID_LICENSE_FIELDS_V1 below. There's
// no shared vocabulary between the two, so each gets its own table rather
// than forcing one into the other's shape.
const VROID_LICENSE_FIELDS_V0: Array<{
  key: keyof PersonaVroidHubCharacterLicenseV0;
  label: string;
  values: Record<string, string>;
}> = [
  {
    key: 'characterization_allowed_user',
    label: 'Who may perform as this character',
    values: { default: 'Platform default', author: 'Author only', everyone: 'Everyone' },
  },
  {
    key: 'personal_commercial_use',
    label: 'Personal commercial use',
    values: {
      default: 'Platform default',
      disallow: 'Not allowed',
      profit: 'Allowed (for-profit)',
      nonprofit: 'Allowed (non-profit only)',
    },
  },
  {
    key: 'corporate_commercial_use',
    label: 'Corporate commercial use',
    values: { default: 'Platform default', disallow: 'Not allowed', allow: 'Allowed' },
  },
  {
    key: 'modification',
    label: 'Modification',
    values: { default: 'Platform default', disallow: 'Not allowed', allow: 'Allowed' },
  },
  {
    key: 'redistribution',
    label: 'Redistribution',
    values: { default: 'Platform default', disallow: 'Not allowed', allow: 'Allowed' },
  },
  {
    key: 'credit',
    label: 'Credit',
    values: {
      default: 'Platform default',
      necessary: 'Required',
      unnecessary: 'Not required',
    },
  },
  {
    key: 'violent_expression',
    label: 'Violent expression',
    values: { default: 'Platform default', disallow: 'Not allowed', allow: 'Allowed' },
  },
  {
    key: 'sexual_expression',
    label: 'Sexual expression',
    values: { default: 'Platform default', disallow: 'Not allowed', allow: 'Allowed' },
  },
];

// VRM 1.0's vrm_meta fields (VRM1Meta), mixing enums and booleans — see
// node_modules/@pixiv/three-vrm-core/types/meta/VRM1Meta.d.ts. Boolean
// values are looked up via their String() form ("true"/"false").
const VROID_LICENSE_FIELDS_V1: Array<{
  key: keyof PersonaVroidHubCharacterLicenseV1;
  label: string;
  values: Record<string, string>;
}> = [
  {
    key: 'avatarPermission',
    label: 'Who may perform as this character',
    values: {
      onlyAuthor: 'Author only',
      onlySeparatelyLicensedPerson: 'Requires a separate license',
      everyone: 'Everyone',
    },
  },
  {
    key: 'commercialUsage',
    label: 'Commercial use',
    values: {
      personalNonProfit: 'Personal, non-profit only',
      personalProfit: 'Personal, for-profit allowed',
      corporation: 'Corporate use allowed',
    },
  },
  {
    key: 'modification',
    label: 'Modification',
    values: {
      prohibited: 'Not allowed',
      allowModification: 'Allowed (no redistribution)',
      allowModificationRedistribution: 'Allowed, including redistribution',
    },
  },
  {
    key: 'creditNotation',
    label: 'Credit',
    values: { required: 'Required', unnecessary: 'Not required' },
  },
  {
    key: 'allowRedistribution',
    label: 'Redistribution (unmodified)',
    values: { true: 'Allowed', false: 'Not allowed' },
  },
  {
    key: 'allowExcessivelyViolentUsage',
    label: 'Excessively violent expression',
    values: { true: 'Allowed', false: 'Not allowed' },
  },
  {
    key: 'allowExcessivelySexualUsage',
    label: 'Excessively sexual expression',
    values: { true: 'Allowed', false: 'Not allowed' },
  },
  {
    key: 'allowPoliticalOrReligiousUsage',
    label: 'Political or religious usage',
    values: { true: 'Allowed', false: 'Not allowed' },
  },
  {
    key: 'allowAntisocialOrHateUsage',
    label: 'Antisocial or hate speech usage',
    values: { true: 'Allowed', false: 'Not allowed' },
  },
];

export function vroidLicenseRows(
  license: PersonaVroidHubCharacterLicense | null | undefined,
): VroidLicenseRow[] {
  const fields = license?.spec_version === '1.0' ? VROID_LICENSE_FIELDS_V1 : VROID_LICENSE_FIELDS_V0;
  return fields
    .map(({ key, label, values }) => {
      // license's two variants share no keys, so this cast is safe per the
      // `fields` table already matching license?.spec_version above.
      const raw = (license as Record<string, unknown> | null | undefined)?.[key as string];
      if (raw == null) return null;
      return { label, value: values[String(raw)] ?? String(raw) };
    })
    .filter((row): row is VroidLicenseRow => row != null);
}
