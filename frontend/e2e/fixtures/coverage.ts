// Playwright fixture that records Chromium V8 JS coverage on every test and
// hands it to monocart-reporter so the configured reports (v8, console-summary,
// lcovonly, json-summary) carry it. On non-Chromium projects the fixture runs
// the body without coverage, because `page.coverage` is a Chromium-only API
// (https://playwright.dev/docs/api/class-coverage, read 2026-09-22). The
// `addCoverageReport` signature is from
// the declaration in monocart-reporter's lib/index.d.ts:
//
//   export function addCoverageReport(
//       coverageData: any[] | any,
//       testInfo: TestInfo
//   ): Promise<AddedResults>;
import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

export const test = base.extend<{ autoCoverage: void }>({
  autoCoverage: [
    async ({ page, browserName }, use, testInfo) => {
      if (browserName !== 'chromium') {
        await use();
        return;
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      const coverageList = await page.coverage.stopJSCoverage();
      await addCoverageReport(coverageList, testInfo);
    },
    { auto: true },
  ],
});

export { expect };
