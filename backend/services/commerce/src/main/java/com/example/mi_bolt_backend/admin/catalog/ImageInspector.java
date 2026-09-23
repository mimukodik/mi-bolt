package com.example.mi_bolt_backend.admin.catalog;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;

import org.springframework.stereotype.Component;

/**
 * Pure inspector the admin upload endpoint will call. It classifies the
 * bytes by their magic header (never trusts a file name or a declared
 * part type) and reads width and height from the header only: the JDK's
 * PNG and JPEG {@link ImageIO} readers pull dimensions out of the header
 * on a seek-only stream, and WebP has no JDK reader on 21, so each of
 * the three WebP chunks is parsed by hand against the published byte
 * offsets.
 *
 * <p>Rejections come in three shapes: {@code EMPTY_FILE} when no bytes
 * were supplied, {@code UNSUPPORTED_IMAGE_TYPE} when the magic does not
 * name PNG, JPEG or WebP, and {@code IMAGE_UNREADABLE} when the magic
 * matches but the header is truncated, malformed, or cannot be decoded
 * by ImageIO. The {@link ImageRejectedException.Reason} carries the
 * single code the endpoint maps to its 422 field-error code.
 */
@Component
public class ImageInspector {

	private static final byte[] PNG_MAGIC = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

	private static final byte[] JPEG_MARKER = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF };

	static final String CONTENT_PNG = "image/png";
	static final String CONTENT_JPEG = "image/jpeg";
	static final String CONTENT_WEBP = "image/webp";

	/**
	 * Inspect {@code bytes} and return its content type and dimensions when
	 * the header names a supported image and carries a readable width and
	 * height.
	 *
	 * @param bytes the raw upload bytes; may be {@code null} or empty
	 * @return the parsed content type and dimensions
	 * @throws ImageRejectedException when the bytes are empty, are not a
	 *         supported image type, or have a malformed header
	 */
	public InspectedImage inspect(byte[] bytes) {
		if (bytes == null || bytes.length == 0) {
			throw new ImageRejectedException(ImageRejectedException.Reason.EMPTY_FILE,
					"no bytes were supplied");
		}

		if (startsWith(bytes, PNG_MAGIC)) {
			return readWithImageIO(bytes, "png", CONTENT_PNG);
		}
		if (startsWith(bytes, JPEG_MARKER)) {
			return readWithImageIO(bytes, "jpeg", CONTENT_JPEG);
		}
		if (isWebp(bytes)) {
			return readWebpDimensions(bytes);
		}
		throw new ImageRejectedException(ImageRejectedException.Reason.UNSUPPORTED_IMAGE_TYPE,
				"first bytes do not match PNG, JPEG or WebP");
	}

	private static boolean startsWith(byte[] bytes, byte[] prefix) {
		if (bytes.length < prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if (bytes[i] != prefix[i]) {
				return false;
			}
		}
		return true;
	}

	private static boolean isWebp(byte[] bytes) {
		return bytes.length >= 12
				&& bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
				&& bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
	}

	private static InspectedImage readWithImageIO(byte[] bytes, String formatName, String contentType) {
		ImageReader reader = ImageIO.getImageReadersByFormatName(formatName).next();
		try (ImageInputStream stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
			reader.setInput(stream, true, true);
			int width = reader.getWidth(0);
			int height = reader.getHeight(0);
			return new InspectedImage(contentType, width, height);
		} catch (IOException ex) {
			throw new ImageRejectedException(ImageRejectedException.Reason.IMAGE_UNREADABLE,
					formatName + " header is truncated or malformed", ex);
		} finally {
			reader.dispose();
		}
	}

	private static InspectedImage readWebpDimensions(byte[] bytes) {
		if (bytes.length < 16) {
			throw unreadable("WebP header is truncated before the chunk FourCC");
		}
		// Chunk FourCC lives at bytes 12..15 (RIFF + 4 size + WEBP + FourCC).
		String fourCc = fourCcAt(bytes, 12);
		return switch (fourCc) {
			case "VP8X" -> readVp8xDimensions(bytes);
			case "VP8L" -> readVp8lDimensions(bytes);
			case "VP8 " -> readVp8Dimensions(bytes);
			default -> throw unreadable("unrecognised WebP chunk '" + fourCc + "'");
		};
	}

	private static String fourCcAt(byte[] bytes, int offset) {
		return new String(new byte[] { bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3] },
				StandardCharsets.US_ASCII);
	}

	private static InspectedImage readVp8xDimensions(byte[] bytes) {
		if (bytes.length < 30) {
			throw unreadable("VP8X header is truncated");
		}
		int widthMinusOne = littleEndian24(bytes, 24);
		int heightMinusOne = littleEndian24(bytes, 27);
		int width = widthMinusOne + 1;
		int height = heightMinusOne + 1;
		return new InspectedImage(CONTENT_WEBP, width, height);
	}

	private static InspectedImage readVp8lDimensions(byte[] bytes) {
		if (bytes.length < 25) {
			throw unreadable("VP8L header is truncated");
		}
		if ((bytes[20] & 0xFF) != 0x2F) {
			throw unreadable("VP8L signature byte is not 0x2F");
		}
		long bits = (bytes[21] & 0xFFL)
				| ((bytes[22] & 0xFFL) << 8)
				| ((bytes[23] & 0xFFL) << 16)
				| ((bytes[24] & 0xFFL) << 24);
		int width = (int) ((bits & 0x3FFFL) + 1L);
		int height = (int) (((bits >> 14) & 0x3FFFL) + 1L);
		return new InspectedImage(CONTENT_WEBP, width, height);
	}

	private static InspectedImage readVp8Dimensions(byte[] bytes) {
		if (bytes.length < 30) {
			throw unreadable("VP8 header is truncated");
		}
		if (bytes[23] != (byte) 0x9D || bytes[24] != 0x01 || bytes[25] != 0x2A) {
			throw unreadable("VP8 key-frame header is missing the start code 9D 01 2A");
		}
		int width = ((bytes[26] & 0xFF) | ((bytes[27] & 0xFF) << 8)) & 0x3FFF;
		int height = ((bytes[28] & 0xFF) | ((bytes[29] & 0xFF) << 8)) & 0x3FFF;
		if (width == 0 || height == 0) {
			throw unreadable("VP8 dimensions are zero");
		}
		return new InspectedImage(CONTENT_WEBP, width, height);
	}

	private static int littleEndian24(byte[] bytes, int offset) {
		return (bytes[offset] & 0xFF)
				| ((bytes[offset + 1] & 0xFF) << 8)
				| ((bytes[offset + 2] & 0xFF) << 16);
	}

	private static ImageRejectedException unreadable(String message) {
		return new ImageRejectedException(ImageRejectedException.Reason.IMAGE_UNREADABLE, message);
	}
}
