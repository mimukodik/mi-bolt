# Local illustrative device media

These original generic vector illustrations are supplied for the fictional MiBolt demo. They are not photographs of real devices. Front and back are distinct images; casing colors match the variant. Do not claim an exact real-device likeness. No supplier artwork, third-party font, 3D model or remote request is included.

At implementation, copy `products/*.webp` to `public/assets/products/`. Keep SVG sources here for provenance. The API uses logical `/assets/` paths; the shared `resolveAssetUrl(path: string, documentBaseUri: string): string` helper in `src/app/shared/media/resolve-asset-url.ts` (used by ProductImage) resolves them under the actual deployment baseHref (strip exactly the leading slash, then new URL(relativePath, document.baseURI)), rejecting any other prefix or external scheme. Test both `/` and `/mi-bolt/`.
