package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.admin.catalog.ImageRejectedException.Reason;

/**
 * Unit tests for {@link ImageInspector}. No Spring context, no database: the
 * inspector is constructed directly with {@code new ImageInspector()} and the
 * bytes are either loaded from a classpath fixture, written in-test by
 * {@link ImageIO}, or built by hand to pin the WebP byte offsets from the
 * RIFF container, lossless bitstream and VP8 specifications.
 */
class ImageInspectorTest {

	private final ImageInspector inspector = new ImageInspector();

	@Test
	void fixturePngReportsPngWithMeasuredDimensions() throws IOException {
		byte[] bytes = readFixturePng();

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/png", 300, 600));
	}

	@Test
	void jpegWrittenInTestHasSevenByFiveDimensions() throws IOException {
		BufferedImage image = new BufferedImage(7, 5, BufferedImage.TYPE_INT_RGB);
		byte[] bytes = writeImage(image, "jpeg");

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/jpeg", 7, 5));
	}

	@Test
	void pngWrittenInTestHasThreeByTwoDimensions() throws IOException {
		BufferedImage image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
		byte[] bytes = writeImage(image, "png");

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/png", 3, 2));
	}

	@Test
	void webpVp8xHeaderIsReadAsSixFortyByFourEighty() {
		byte[] bytes = vp8xHeader(640, 480);

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/webp", 640, 480));
	}

	@Test
	void webpVp8lHeaderIsReadAsHundredByFifty() {
		int width = 100;
		int height = 50;
		long bits = (long) (width - 1) | ((long) (height - 1) << 14);
		byte[] bytes = buildWebpChunk("VP8L", 25, new int[] { 0x2F, (int) (bits & 0xFF),
				(int) ((bits >> 8) & 0xFF), (int) ((bits >> 16) & 0xFF), (int) ((bits >> 24) & 0xFF) });

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/webp", width, height));
	}

	@Test
	void webpVp8HeaderIsReadAsThreeTwentyByTwoForty() {
		byte[] bytes = vp8Header(320, 240);

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/webp", 320, 240));
	}

	@Test
	void webpVp8WidthMaskStripsScaleBits() {
		// 0x4140 has bit 14 (0x4000) set as a scale marker and a width of 0x140 = 320.
		byte[] widthBytes = { 0x40, 0x41 };
		byte[] heightBytes = { (byte) 240, 0x00 };
		byte[] bytes = vp8HeaderRaw(widthBytes, heightBytes);

		assertThat(inspector.inspect(bytes))
				.isEqualTo(new InspectedImage("image/webp", 320, 240));
	}

	@Test
	void gifMagicIsUnsupportedType() {
		byte[] bytes = ascii("GIF89a1234567890");

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.UNSUPPORTED_IMAGE_TYPE);
	}

	@Test
	void emptyArrayIsEmptyFile() {
		assertThatThrownBy(() -> inspector.inspect(new byte[0]))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.EMPTY_FILE);
	}

	@Test
	void nullBytesIsEmptyFile() {
		assertThatThrownBy(() -> inspector.inspect(null))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.EMPTY_FILE);
	}

	@Test
	void twoBytesOfJpegMagicAreUnsupportedType() {
		byte[] bytes = { (byte) 0xFF, (byte) 0xD8 };

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.UNSUPPORTED_IMAGE_TYPE);
	}

	@Test
	void truncatedPngIsUnreadable() {
		byte[] magic = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
		byte[] bytes = concat(magic, new byte[4]);

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8xHeaderOfTwentyBytesIsUnreadable() {
		byte[] bytes = vp8xHeader(640, 480);
		byte[] truncated = new byte[20];
		System.arraycopy(bytes, 0, truncated, 0, 20);

		assertThatThrownBy(() -> inspector.inspect(truncated))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void webpHeaderOfFifteenBytesIsUnreadable() {
		byte[] riff = ascii("RIFF");
		byte[] size = new byte[] { 0, 0, 0, 0 };
		byte[] webp = ascii("WEBP");
		byte[] prefix = concat(riff, size);
		prefix = concat(prefix, webp);
		byte[] bytes = new byte[15];
		System.arraycopy(prefix, 0, bytes, 0, prefix.length);

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8lHeaderWithoutSignatureByteIsUnreadable() {
		long bits = (long) (100 - 1) | ((long) (50 - 1) << 14);
		byte[] bytes = buildWebpChunk("VP8L", 25,
				new int[] { 0x00, (int) (bits & 0xFF), (int) ((bits >> 8) & 0xFF),
						(int) ((bits >> 16) & 0xFF), (int) ((bits >> 24) & 0xFF) });

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8HeaderWithZeroWidthIsUnreadable() {
		byte[] bytes = vp8HeaderRaw(new byte[] { 0x00, 0x00 }, new byte[] { (byte) 240, 0x00 });

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8HeaderOfTwentyNineBytesIsUnreadable() {
		byte[] bytes = vp8Header(320, 240);
		byte[] truncated = new byte[29];
		System.arraycopy(bytes, 0, truncated, 0, 29);

		assertThatThrownBy(() -> inspector.inspect(truncated))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8HeaderWithWrongStartCodeIsUnreadable() {
		byte[] bytes = vp8Header(320, 240);
		bytes[23] = 0x00;

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void vp8lHeaderOfTwentyBytesIsUnreadable() {
		int width = 100;
		int height = 50;
		long bits = (long) (width - 1) | ((long) (height - 1) << 14);
		byte[] bytes = buildWebpChunk("VP8L", 25, new int[] { 0x2F, (int) (bits & 0xFF),
				(int) ((bits >> 8) & 0xFF), (int) ((bits >> 16) & 0xFF), (int) ((bits >> 24) & 0xFF) });
		byte[] truncated = new byte[20];
		System.arraycopy(bytes, 0, truncated, 0, 20);

		assertThatThrownBy(() -> inspector.inspect(truncated))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void pngWithZeroWidthIsUnreadable() throws IOException {
		// The IHDR width field occupies bytes 16..19 of every PNG.
		byte[] bytes = writeImage(new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB), "png");
		bytes[16] = 0;
		bytes[17] = 0;
		bytes[18] = 0;
		bytes[19] = 0;

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void jpegWithZeroHeightIsUnreadable() throws IOException {
		// The SOF0 height field occupies bytes +5 and +6 after the marker 0xFF 0xC0.
		byte[] bytes = writeImage(new BufferedImage(7, 5, BufferedImage.TYPE_INT_RGB), "jpeg");
		int sofIndex = -1;
		for (int i = 0; i < bytes.length - 1; i++) {
			if ((bytes[i] & 0xFF) == 0xFF && (bytes[i + 1] & 0xFF) == 0xC0) {
				sofIndex = i;
				break;
			}
		}
		bytes[sofIndex + 5] = 0;
		bytes[sofIndex + 6] = 0;

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void webpWithUnknownFourCcIsUnreadable() {
		byte[] bytes = riffWebp("ABCD", 30, new byte[0]);

		assertThatThrownBy(() -> inspector.inspect(bytes))
				.isInstanceOf(ImageRejectedException.class)
				.extracting("reason").isEqualTo(Reason.IMAGE_UNREADABLE);
	}

	@Test
	void inspectReadsMagicBytesOnlyAndNotTheCallersVariableNaming() throws IOException {
		// The inspector API takes only the bytes: there is no name parameter,
		// so the local variable naming the PNG bytes must not influence the
		// content type the inspector returns.
		byte[] pngBytes = readFixturePng();

		assertThat(inspector.inspect(pngBytes))
				.isEqualTo(new InspectedImage("image/png", 300, 600));
	}

	// ---------- helpers --------------------------------------------------

	private static byte[] readFixturePng() throws IOException {
		try (InputStream stream = ImageInspectorTest.class
				.getResourceAsStream("/catalog/images/0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8.png")) {
			if (stream == null) {
				throw new IOException("PNG fixture not found on classpath");
			}
			return stream.readAllBytes();
		}
	}

	private static byte[] writeImage(BufferedImage image, String format) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		boolean written = ImageIO.write(image, format, out);
		if (!written) {
			throw new IOException("ImageIO cannot write " + format);
		}
		return out.toByteArray();
	}

	private static byte[] ascii(String value) {
		byte[] bytes = new byte[value.length()];
		for (int i = 0; i < value.length(); i++) {
			bytes[i] = (byte) value.charAt(i);
		}
		return bytes;
	}

	private static byte[] concat(byte[] left, byte[] right) {
		byte[] out = new byte[left.length + right.length];
		System.arraycopy(left, 0, out, 0, left.length);
		System.arraycopy(right, 0, out, left.length, right.length);
		return out;
	}

	/**
	 * Build a WebP with a chunk identified by {@code fourCc}. The chunk's
	 * payload area starts at the {@code payloadOffset}th byte and the chunk
	 * ends at the start of the next chunk (or the byte after, when this is
	 * the only chunk). The {@code payload} bytes are placed at the start of
	 * the chunk payload area.
	 */
	private static byte[] buildWebpChunk(String fourCc, int payloadOffset, int[] payload) {
		int chunkPayloadLength = payloadOffset + payload.length;
		byte[] size = intLittleEndian(chunkPayloadLength);
		return riffWebp(fourCc, chunkPayloadLength,
				concat(size, bytesFromInts(payload)));
	}

	private static byte[] riffWebp(String fourCc, int chunkPayloadLength, byte[] afterRiffAndFourCc) {
		byte[] riff = ascii("RIFF");
		byte[] size = intLittleEndian(4 + chunkPayloadLength);
		byte[] webp = ascii("WEBP");
		byte[] four = ascii(fourCc);
		byte[] out = new byte[12 + 4 + afterRiffAndFourCc.length + 4 + (chunkPayloadLength - afterRiffAndFourCc.length + 1) / 2 * 2];
		int pos = 0;
		System.arraycopy(riff, 0, out, pos, 4); pos += 4;
		System.arraycopy(size, 0, out, pos, 4); pos += 4;
		System.arraycopy(webp, 0, out, pos, 4); pos += 4;
		System.arraycopy(four, 0, out, pos, 4); pos += 4;
		System.arraycopy(afterRiffAndFourCc, 0, out, pos, afterRiffAndFourCc.length);
		return out;
	}

	private static byte[] vp8xHeader(int width, int height) {
		// RIFF + size + WEBP + VP8X + 4-byte chunk size + flags + 3 reserved + 24-bit width-1 + 24-bit height-1 = 30 bytes
		int widthMinusOne = width - 1;
		int heightMinusOne = height - 1;
		byte[] widthBits = new byte[] {
				(byte) (widthMinusOne & 0xFF),
				(byte) ((widthMinusOne >> 8) & 0xFF),
				(byte) ((widthMinusOne >> 16) & 0xFF) };
		byte[] heightBits = new byte[] {
				(byte) (heightMinusOne & 0xFF),
				(byte) ((heightMinusOne >> 8) & 0xFF),
				(byte) ((heightMinusOne >> 16) & 0xFF) };
		byte[] riff = ascii("RIFF");
		byte[] size = intLittleEndian(4 + 10 + widthBits.length + heightBits.length);
		byte[] webp = ascii("WEBP");
		byte[] vp8x = ascii("VP8X");
		byte[] chunkSize = intLittleEndian(10);
		byte[] flags = { 0 };
		byte[] reserved = { 0, 0, 0 };
		byte[] out = new byte[4 + 4 + 4 + 4 + 4 + 1 + 3 + 3 + 3];
		int pos = 0;
		System.arraycopy(riff, 0, out, pos, riff.length); pos += riff.length;
		System.arraycopy(size, 0, out, pos, size.length); pos += size.length;
		System.arraycopy(webp, 0, out, pos, webp.length); pos += webp.length;
		System.arraycopy(vp8x, 0, out, pos, vp8x.length); pos += vp8x.length;
		System.arraycopy(chunkSize, 0, out, pos, chunkSize.length); pos += chunkSize.length;
		System.arraycopy(flags, 0, out, pos, flags.length); pos += flags.length;
		System.arraycopy(reserved, 0, out, pos, reserved.length); pos += reserved.length;
		System.arraycopy(widthBits, 0, out, pos, widthBits.length); pos += widthBits.length;
		System.arraycopy(heightBits, 0, out, pos, heightBits.length);
		return out;
	}

	private static byte[] vp8Header(int width, int height) {
		return vp8HeaderRaw(
				new byte[] { (byte) (width & 0xFF), (byte) ((width >> 8) & 0xFF) },
				new byte[] { (byte) (height & 0xFF), (byte) ((height >> 8) & 0xFF) });
	}

	/**
	 * Build a VP8 (lossy) WebP frame: RIFF + size + WEBP + VP8 + chunk size +
	 * 3 frame tag bytes + start code 9D 01 2A + width LE16 + height LE16 +
	 * 2 trailing bytes to round the chunk payload to 14 bytes, total 30 bytes.
	 */
	private static byte[] vp8HeaderRaw(byte[] widthBytes, byte[] heightBytes) {
		byte[] riff = ascii("RIFF");
		byte[] size = intLittleEndian(4 + 16);
		byte[] webp = ascii("WEBP");
		byte[] vp8 = ascii("VP8 ");
		byte[] chunkSize = intLittleEndian(16);
		// Frame tag occupies bytes 20-22; start code 9D 01 2A at bytes 23-25.
		byte[] frameTag = { 0x10, 0x00, 0x00 };
		byte[] startCode = { (byte) 0x9D, 0x01, 0x2A };
		byte[] tail = { 0x00, 0x00 };
		byte[] payload = concat(frameTag, startCode);
		payload = concat(payload, widthBytes);
		payload = concat(payload, heightBytes);
		payload = concat(payload, tail);
		byte[] out = new byte[20 + payload.length];
		int pos = 0;
		System.arraycopy(riff, 0, out, pos, riff.length); pos += riff.length;
		System.arraycopy(size, 0, out, pos, size.length); pos += size.length;
		System.arraycopy(webp, 0, out, pos, webp.length); pos += webp.length;
		System.arraycopy(vp8, 0, out, pos, vp8.length); pos += vp8.length;
		System.arraycopy(chunkSize, 0, out, pos, chunkSize.length); pos += chunkSize.length;
		System.arraycopy(payload, 0, out, pos, payload.length);
		return out;
	}

	private static byte[] intLittleEndian(int value) {
		return new byte[] {
				(byte) (value & 0xFF),
				(byte) ((value >> 8) & 0xFF),
				(byte) ((value >> 16) & 0xFF),
				(byte) ((value >> 24) & 0xFF) };
	}

	private static byte[] bytesFromInts(int[] values) {
		byte[] out = new byte[values.length];
		for (int i = 0; i < values.length; i++) {
			out[i] = (byte) (values[i] & 0xFF);
		}
		return out;
	}
}
