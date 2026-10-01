import type { Page } from '@playwright/test';
import { expect } from './coverage';

const CANARY_SLUG = 'mi-bolt-smoke-canary';
const CANARY_VARIANT = 'mi-bolt-smoke-canary--fekete--128';

/** An unavailable canary fails the smoke; never fall back to a demo phone. */
export async function openSmokeCanary(page: Page): Promise<void> {
  await page.goto('/telefonok');
  await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(page.locator(`a[href*="${CANARY_SLUG}"]`)).toHaveCount(0);
  await page.goto(`/telefonok/${CANARY_SLUG}?variant=${CANARY_VARIANT}`);
  await expect(page.getByTestId('product-page')).toBeVisible();
  await expect(page.getByTestId('add-to-cart-button').getByRole('button')).toBeEnabled();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Prove the completed browser journey bought only the synthetic fixture. */
export async function expectSmokeCanaryReceipt(page: Page): Promise<void> {
  const orderId = new URL(page.url()).pathname.split('/').pop();
  expect(orderId).toBeTruthy();
  const response = await page.request.get(`/api/v1/orders/${orderId ?? ''}`);
  expect(response.ok()).toBe(true);
  const receipt: unknown = await response.json();
  if (!isRecord(receipt) || !Array.isArray(receipt['items'])) {
    throw new Error('Smoke receipt must contain order items');
  }
  const items: unknown[] = receipt['items'];
  expect(items).toHaveLength(1);
  for (const item of items) {
    if (!isRecord(item)) throw new Error('Smoke receipt item must be an object');
    expect(item['variantId']).toBe(CANARY_VARIANT);
    expect(item['quantity']).toBe(1);
  }
  const productResponse = await page.request.get(`/api/v1/products/${CANARY_SLUG}`);
  expect(productResponse.ok()).toBe(true);
  const product: unknown = await productResponse.json();
  if (!isRecord(product) || !Array.isArray(product['variants'])) {
    throw new Error('Smoke canary must expose its variant');
  }
  const variants: unknown[] = product['variants'];
  expect(variants).toHaveLength(1);
  const variant = variants[0];
  if (!isRecord(variant)) throw new Error('Smoke canary variant must be an object');
  expect(variant['id']).toBe(CANARY_VARIANT);
  expect(variant['availability']).toBe('in_stock');
  expect(variant['maxQuantity']).toBe(5);
}
