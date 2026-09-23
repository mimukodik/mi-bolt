package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validMultipartAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

import javax.imageio.ImageIO;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.catalog.CatalogImageRepository;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/** The AdminMedia upload against the real security chain and database (MIM-347). */
@IntegrationTest
class AdminMediaApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CatalogImageRepository catalogImageRepository;

	private final List<String> createdIds = new ArrayList<>();

	private static final String FIXTURE_ID = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";

	@AfterEach
	void deleteUploadedImages() {
		catalogImageRepository.deleteAllById(createdIds);
		createdIds.clear();
	}

	// Fails if AdminMediaService stops saving new bytes or the controller stops answering 201 with the media URL.
	@Test
	void newBytesAreStoredAnd201WithTheirMediaUrl() throws Exception {
		byte[] png = png(3, 2);
		String id = sha256Hex(png);
		createdIds.add(id);

		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(multipart("/admin/media").file(new MockMultipartFile("file", "photo.gif", "image/gif", png)).with(signed))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/media/" + id))
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.src").value("/api/v1/media/" + id))
				.andExpect(jsonPath("$.contentType").value("image/png"))
				.andExpect(jsonPath("$.width").value(3))
				.andExpect(jsonPath("$.height").value(2))
				.andExpect(jsonPath("$.sizeBytes").value(png.length))
				.andExpect(validMultipartAgainstContract());

		mockMvc.perform(get("/media/" + id))
				.andExpect(status().isOk())
				.andExpect(content().contentType("image/png"))
				.andExpect(content().bytes(png));
	}

	// Fails if AdminMediaService stops returning the stored row for bytes it already holds.
	@Test
	void storedBytesAnswer200WithTheStoredRow() throws Exception {
		byte[] fixture = Files.readAllBytes(Path.of("src/test/resources/catalog/images/" + FIXTURE_ID + ".png"));
		long before = catalogImageRepository.count();

		mockMvc.perform(multipart("/admin/media").file(filePart(fixture)).with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Location"))
				.andExpect(jsonPath("$.id").value(FIXTURE_ID))
				.andExpect(jsonPath("$.src").value("/api/v1/media/" + FIXTURE_ID))
				.andExpect(jsonPath("$.contentType").value("image/png"))
				.andExpect(jsonPath("$.width").value(300))
				.andExpect(jsonPath("$.height").value(600))
				.andExpect(jsonPath("$.sizeBytes").value(84112))
				.andExpect(validMultipartAgainstContract());

		assertThat(catalogImageRepository.count()).isEqualTo(before);
	}

	// Fails if an UNSUPPORTED_IMAGE_TYPE rejection stops answering 422 at /file.
	@Test
	void gifBytesAre422UnsupportedImageType() throws Exception {
		byte[] bytes = "GIF89a\u0001\u0000\u0001\u0000".getBytes(StandardCharsets.US_ASCII);
		long before = catalogImageRepository.count();

		mockMvc.perform(multipart("/admin/media").file(filePart(bytes)).with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.title").value("Section rejected"))
				.andExpect(jsonPath("$.detail").value("One or more supplied fields are not acceptable"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/file"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("UNSUPPORTED_IMAGE_TYPE"))
				.andExpect(jsonPath("$.fieldErrors[0].params").value(Matchers.anEmptyMap()))
				.andExpect(validMultipartAgainstContract());

		assertThat(catalogImageRepository.count()).isEqualTo(before);
	}

	// Fails if an EMPTY_FILE rejection stops answering 422 at /file.
	@Test
	void anEmptyPartIs422EmptyFile() throws Exception {
		mockMvc.perform(multipart("/admin/media").file(filePart(new byte[0])).with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/file"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("EMPTY_FILE"))
				.andExpect(validMultipartAgainstContract());
	}

	// Fails if an IMAGE_UNREADABLE rejection stops answering 422 at /file.
	@Test
	void aTruncatedPngHeaderIs422ImageUnreadable() throws Exception {
		byte[] bytes = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

		mockMvc.perform(multipart("/admin/media").file(filePart(bytes)).with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/file"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("IMAGE_UNREADABLE"))
				.andExpect(validMultipartAgainstContract());
	}

	// Fails if the upload stops requiring the file part.
	@Test
	void aRequestWithoutTheFilePartIs400() throws Exception {
		byte[] png = png(6, 2);
		createdIds.add(sha256Hex(png));

		mockMvc.perform(multipart("/admin/media").file(new MockMultipartFile("image", "photo.png", "image/png", png))
				.with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Missing required request part"))
				.andExpect(jsonPath("$.params.part").value("file"))
				.andExpect(validMultipartAgainstContract());
	}

	// Fails if UnknownQueryParameterInterceptor stops treating a part without a filename as a request parameter.
	@Test
	void aTextPartIs400UnknownParameter() throws Exception {
		byte[] png = png(5, 2);
		String id = sha256Hex(png);
		createdIds.add(id);

		mockMvc.perform(multipart("/admin/media").file(filePart(png)).param("caption", "front")
				.with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("caption"))
				.andExpect(validMultipartAgainstContract());

		assertThat(catalogImageRepository.existsById(id)).isFalse();
	}

	// Fails if the unknown query key stops being rejected before the upload is stored.
	@Test
	void anUnknownQueryKeyIs400AndNothingIsStored() throws Exception {
		byte[] png = png(4, 2);
		String id = sha256Hex(png);
		createdIds.add(id);

		mockMvc.perform(multipart("/admin/media?x=1").file(filePart(png))
				.with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("x"))
				.andExpect(validMultipartAgainstContract());

		assertThat(catalogImageRepository.existsById(id)).isFalse();
	}

	// Fails if AdminMediaApi#uploadAdminMedia stops requiring the adminSession security scheme.
	@Test
	void anUploadWithoutASessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(multipart("/admin/media").file(filePart(png(7, 2)))
				.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf), new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session"))
				.header(AdminLogin.XSRF_HEADER, xsrf))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validMultipartAgainstContract());
	}

	// Fails if the admin chain stops enforcing the XSRF header on POST /admin/media.
	@Test
	void anUploadWithoutTheXsrfHeaderIs403() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(multipart("/admin/media").file(filePart(png(8, 2)))
				.session(signed.session())
				.cookie(new Cookie(AdminLogin.SESSION_COOKIE, signed.session().getId()),
						new Cookie(AdminLogin.XSRF_COOKIE, signed.xsrfToken())))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
	}

	private static byte[] png(int width, int height) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	private static String sha256Hex(byte[] bytes) throws NoSuchAlgorithmException {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
	}

	private static MockMultipartFile filePart(byte[] bytes) {
		return new MockMultipartFile("file", "photo.png", "image/png", bytes);
	}
}