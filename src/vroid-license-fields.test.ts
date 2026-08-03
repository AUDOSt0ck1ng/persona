import { describe, expect, it } from 'vitest';
import { vroidLicenseRows } from './vroid-license-fields';

describe('vroidLicenseRows', () => {
  it('renders VRM 0.0 fields with their VRoid Hub labels and values', () => {
    const rows = vroidLicenseRows({
      spec_version: '0.0',
      credit: 'necessary',
      personal_commercial_use: 'profit',
    });

    expect(rows).toEqual([
      { label: 'Personal commercial use', value: 'Allowed (for-profit)' },
      { label: 'Credit', value: 'Required' },
    ]);
  });

  it('renders VRM 1.0 fields, including booleans, with their own labels and values', () => {
    const rows = vroidLicenseRows({
      spec_version: '1.0',
      commercialUsage: 'personalProfit',
      creditNotation: 'required',
      allowRedistribution: false,
    });

    expect(rows).toEqual([
      { label: 'Commercial use', value: 'Personal, for-profit allowed' },
      { label: 'Credit', value: 'Required' },
      { label: 'Redistribution (unmodified)', value: 'Not allowed' },
    ]);
  });

  it('falls back to the raw value when it is not in the known vocabulary', () => {
    const rows = vroidLicenseRows({
      spec_version: '0.0',
      credit: 'somethingUnexpected' as never,
    });

    expect(rows).toEqual([{ label: 'Credit', value: 'somethingUnexpected' }]);
  });

  it('omits fields the model did not set at all', () => {
    const rows = vroidLicenseRows({ spec_version: '0.0' });
    expect(rows).toEqual([]);
  });

  it('returns no rows for a null or missing license', () => {
    expect(vroidLicenseRows(null)).toEqual([]);
    expect(vroidLicenseRows(undefined)).toEqual([]);
  });
});
