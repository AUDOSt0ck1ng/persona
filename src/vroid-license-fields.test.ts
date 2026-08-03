import { describe, expect, it } from 'vitest';
import { vroidLicenseRows } from './vroid-license-fields';

describe('vroidLicenseRows', () => {
  it('renders the complete VRM 0.0 conditions-of-use table', () => {
    const rows = vroidLicenseRows({
      spec_version: '0.0',
      characterization_allowed_user: 'everyone',
      violent_expression: 'allow',
      sexual_expression: 'disallow',
      corporate_commercial_use: 'disallow',
      personal_commercial_use: 'nonprofit',
      redistribution: 'allow',
      modification: 'disallow',
      credit: 'necessary',
    });

    expect(rows).toEqual([
      { label: 'Avatar use', value: 'Allow' },
      { label: 'Violent acts', value: 'Allow' },
      { label: 'Sexual acts', value: 'Do not allow' },
      { label: 'Corporate use', value: 'Do not allow' },
      { label: 'Individual commercial use', value: 'Non-profit activities only' },
      { label: 'Redistribution', value: 'Allow' },
      { label: 'Alterations', value: 'Do not allow' },
      { label: 'Attribution', value: 'Required' },
    ]);
  });

  it('renders the complete VRM 1.0 table and splits shared source fields', () => {
    const rows = vroidLicenseRows({
      spec_version: '1.0',
      avatarPermission: 'everyone',
      allowExcessivelyViolentUsage: true,
      allowExcessivelySexualUsage: false,
      allowPoliticalOrReligiousUsage: true,
      allowAntisocialOrHateUsage: false,
      commercialUsage: 'personalProfit',
      allowRedistribution: false,
      modification: 'allowModification',
      creditNotation: 'required',
    });

    expect(rows).toEqual([
      { label: 'Avatar use', value: 'Allow' },
      { label: 'Violent acts', value: 'Allow' },
      { label: 'Sexual acts', value: 'Do not allow' },
      { label: 'Political/religious acts', value: 'Allow' },
      { label: 'Antisocial/hateful acts', value: 'Do not allow' },
      { label: 'Corporate use', value: 'Do not allow' },
      { label: 'Individual commercial use', value: 'Allow' },
      { label: 'Redistribution', value: 'Do not allow' },
      { label: 'Alterations', value: 'Allow' },
      { label: 'Redistribution of altered model', value: 'Do not allow' },
      { label: 'Attribution', value: 'Required' },
    ]);
  });

  it('renders unset source fields as Not set', () => {
    expect(vroidLicenseRows({ spec_version: '1.0' })).toEqual([
      { label: 'Avatar use', value: 'Not set' },
      { label: 'Violent acts', value: 'Not set' },
      { label: 'Sexual acts', value: 'Not set' },
      { label: 'Political/religious acts', value: 'Not set' },
      { label: 'Antisocial/hateful acts', value: 'Not set' },
      { label: 'Corporate use', value: 'Not set' },
      { label: 'Individual commercial use', value: 'Not set' },
      { label: 'Redistribution', value: 'Not set' },
      { label: 'Alterations', value: 'Not set' },
      { label: 'Redistribution of altered model', value: 'Not set' },
      { label: 'Attribution', value: 'Not set' },
    ]);
  });

  it('maps VRM 0.0 default values to Not set', () => {
    const rows = vroidLicenseRows({
      spec_version: '0.0',
      characterization_allowed_user: 'default',
      credit: 'default',
    });

    expect(rows[0]).toEqual({ label: 'Avatar use', value: 'Not set' });
    expect(rows[7]).toEqual({ label: 'Attribution', value: 'Not set' });
  });

  it('falls back to the raw value when it is not in the known vocabulary', () => {
    const rows = vroidLicenseRows({
      spec_version: '0.0',
      credit: 'somethingUnexpected' as never,
    });

    expect(rows[7]).toEqual({ label: 'Attribution', value: 'somethingUnexpected' });
  });

  it('returns no rows for a null or missing license', () => {
    expect(vroidLicenseRows(null)).toEqual([]);
    expect(vroidLicenseRows(undefined)).toEqual([]);
  });
});
