package com.example.mi_bolt_backend.admin.catalog;

/**
 * Result of {@link ImageInspector#inspect(byte[])} when the bytes name a
 * supported image and its header carries a readable width and height. The
 * {@code contentType} is exactly one of {@code "image/png"}, {@code
 * "image/jpeg"} or {@code "image/webp"} and the dimensions come from the
 * header alone, not from a decoded pixel buffer.
 *
 * @param contentType the MIME type derived from the magic bytes
 * @param width       pixel width, ≥ 1
 * @param height      pixel height, ≥ 1
 */
public record InspectedImage(String contentType, int width, int height) {
}
