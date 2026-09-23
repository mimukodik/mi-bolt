package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;
import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

/**
 * {@code POST /admin/products} against the real chain. Every test creates its
 * own products so the 3-product fixture (ids 1-3) is never touched.
 */
@IntegrationTest
class AdminProductCreateApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	private final List<Long> createdIds = new ArrayList<>();

	@AfterEach
	void deleteCreatedProducts() {
		for (Long id : createdIds) {
			AdminProductInputs.delete(jdbc, id);
		}
		createdIds.clear();
	}

	// Fails if AdminProductsController#createAdminProduct stops answering 201 with the Location, the ETag and the derived variant id.
	@Test
	void createAnswers201WithLocationEtagAndDerivedVariantId() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		MvcResult result = mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b11-create", false)))
				.andExpect(status().isCreated())
				.andExpect(header().string("ETag", "\"0\""))
				.andExpect(jsonPath("$.status").value("active"))
				.andExpect(jsonPath("$.version").value(0))
				.andExpect(jsonPath("$.slug").value("b11-create"))
				.andExpect(jsonPath("$.variants[0].id").value("b11-create--black--128"))
				.andExpect(jsonPath("$.variants[0].stock").value(5))
				.andExpect(validAgainstContract())
				.andReturn();
		long id = ((Number) JsonPath.read(result.getResponse().getContentAsString(), "$.id")).longValue();
		createdIds.add(id);
		header().string("Location", "/admin/products/" + id).match(result);
	}

	// Fails if a created product is not saved where the shop reads it.
	@Test
	void aCreatedProductIsInTheShop() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-shop", false);
		createdIds.add(id);

		mockMvc.perform(get("/products/b11-shop"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.slug").value("b11-shop"));
	}

	// Fails if the SLUG_TAKEN check is removed.
	@Test
	void aTakenSlugIs422SlugTaken() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("nokia-105", false)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.detail").value("One or more supplied fields are not acceptable"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/slug"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SLUG_TAKEN"))
				.andExpect(jsonPath("$.fieldErrors[0].params", Matchers.anEmptyMap()))
				.andExpect(validAgainstContract());
	}

	// Fails if the UNKNOWN_IMAGE check is removed.
	@Test
	void anUnknownImageIs422UnknownImage() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-image", false)
				.replace(AdminProductInputs.IMAGE_ID, "f".repeat(64));

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/colors/0/imageId"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("UNKNOWN_IMAGE"));
	}

	// Fails if a colour reusing an already rejected imageId is skipped instead of reported.
	@Test
	void twoColoursWithTheSameUnknownImageAreTwoErrors() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String unknown = "f".repeat(64);
		String body = AdminProductInputs.body("b11-two-images", false)
				.replace(AdminProductInputs.IMAGE_ID, unknown)
				.replace("\"colors\":[", "\"colors\":[{\"code\":\"white\",\"name\":\"Fehér\",\"swatchHex\":\"#FFFFFF\",\"imageId\":\""
						+ unknown + "\",\"alt\":\"Test phone, white\"},");

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(2))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/colors/0/imageId"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("UNKNOWN_IMAGE"))
				.andExpect(jsonPath("$.fieldErrors[1].path").value("/colors/1/imageId"))
				.andExpect(jsonPath("$.fieldErrors[1].code").value("UNKNOWN_IMAGE"))
				.andExpect(validAgainstContract());
	}

	// Fails if the database rules stop being collected into one answer in their order.
	@Test
	void aTakenSlugAndAnUnknownImageComeTogether() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("nokia-105", false)
				.replace(AdminProductInputs.IMAGE_ID, "f".repeat(64));

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(2))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/slug"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SLUG_TAKEN"))
				.andExpect(jsonPath("$.fieldErrors[1].path").value("/colors/0/imageId"))
				.andExpect(jsonPath("$.fieldErrors[1].code").value("UNKNOWN_IMAGE"));
	}

	// Fails if the FEATURED_LIMIT check on create is removed or stops counting only active featured products.
	@Test
	void aFifthFeaturedProductIs422FeaturedLimit() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-f1", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-f2", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-f3", true));

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b11-f4", true)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/featured"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("FEATURED_LIMIT"))
				.andExpect(jsonPath("$.fieldErrors[0].params.max").value(4));
	}

	// Fails if AdminProductValidator stops running before the database rules.
	@Test
	void aBlankBrandIs422NotBlank() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-blank", false)
				.replace("\"brand\":\"Testbrand\"", "\"brand\":\"   \"");

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/brand"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("NOTBLANK"));
	}

	// Fails if a REQUIRED from the validator stops turning the answer into a 400.
	@Test
	void aNullColourIs400Required() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-null", false)
				.replace("\"alt\":\"Test phone, black\"}]", "\"alt\":\"Test phone, black\"},null]");

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Missing required member"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/colors/1"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"));
	}

	// Fails if bean validation stops running on the create body.
	@Test
	void anEmptyNameIs422Size() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-empty", false)
				.replace("\"name\":\"Test phone\"", "\"name\":\"\"");

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/name"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SIZE"));
	}

	// Fails if a missing member stops being a 400.
	@Test
	void aMissingSlugIs400Required() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-x", false)
				.replace("\"slug\":\"b11-x\",", "");

		mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Missing required member"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/slug"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"));
	}

	// Fails if the unknown query key stops being rejected on create.
	@Test
	void anUnknownQueryKeyIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/products").param("x", "1")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b11-query", false)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("x"));

		mockMvc.perform(get("/admin/products").param("q", "b11-query").param("status", "all").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(0));
	}

	// Fails if AdminProductsApi#createAdminProduct stops requiring the adminSession security scheme.
	@Test
	void createWithoutASessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(post("/admin/products")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b11-nosession", false)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}

	// Fails if the admin chain stops enforcing the XSRF header on POST /admin/products.
	@Test
	void createWithoutTheXsrfHeaderIs403() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/products")
						.session(signed.session())
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, signed.session().getId()),
								new Cookie(AdminLogin.XSRF_COOKIE, signed.xsrfToken()))
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b11-csrf", false)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
	}

	// Fails if AdminProductCommandService#toProduct stops stripping brand, name, description,
	// each highlight, each colour name and alt, each spec group title, and each spec row label
	// and value before storing them.
	@Test
	void createStoresFreeTextStripped() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = AdminProductInputs.body("b11-strip", false)
				.replace("\"brand\":\"Testbrand\"", "\"brand\":\"  Testbrand \\t\"")
				.replace("\"name\":\"Test phone\"", "\"name\":\" Test phone \"")
				.replace("\"description\":\"A phone made for a test.\"",
						"\"description\":\" A phone made for a test.\\n\"")
				.replace("\"highlights\":[\"Long battery\"]", "\"highlights\":[\" Long battery \"]")
				.replace("\"name\":\"Fekete\"", "\"name\":\" Fekete \"")
				.replace("\"alt\":\"Test phone, black\"", "\"alt\":\" Test phone, black \"")
				.replace("\"title\":\"Kijelző\"", "\"title\":\" Kijelző \"")
				.replace("\"label\":\"Méret\"", "\"label\":\" Méret \"")
				.replace("\"value\":\"6,1 hüvelyk\"", "\"value\":\" 6,1 hüvelyk \"");

		MvcResult result = mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.brand").value("Testbrand"))
				.andExpect(jsonPath("$.name").value("Test phone"))
				.andExpect(jsonPath("$.description").value("A phone made for a test."))
				.andExpect(jsonPath("$.highlights[0]").value("Long battery"))
				.andExpect(jsonPath("$.colors[0].name").value("Fekete"))
				.andExpect(jsonPath("$.colors[0].image.alt").value("Test phone, black"))
				.andExpect(jsonPath("$.specGroups[0].title").value("Kijelző"))
				.andExpect(jsonPath("$.specGroups[0].rows[0].label").value("Méret"))
				.andExpect(jsonPath("$.specGroups[0].rows[0].value").value("6,1 hüvelyk"))
				.andReturn();
		long id = ((Number) JsonPath.read(result.getResponse().getContentAsString(), "$.id")).longValue();
		createdIds.add(id);
	}

	// Fails if a padded brand is stored as a second, distinct brand instead of being stripped first.
	@Test
	void aPaddedBrandIsOneBrand() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String bodyA = AdminProductInputs.body("b11-brand-a", false);
		String bodyB = AdminProductInputs.body("b11-brand-b", false)
				.replace("\"brand\":\"Testbrand\"", "\"brand\":\" Testbrand \"");

		MvcResult resultA = mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyA))
				.andExpect(status().isCreated())
				.andReturn();
		createdIds.add(((Number) JsonPath.read(resultA.getResponse().getContentAsString(), "$.id")).longValue());

		MvcResult resultB = mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyB))
				.andExpect(status().isCreated())
				.andReturn();
		createdIds.add(((Number) JsonPath.read(resultB.getResponse().getContentAsString(), "$.id")).longValue());

		mockMvc.perform(get("/admin/brands").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@ == 'Testbrand')]", Matchers.hasSize(1)))
				.andExpect(jsonPath("$[?(@ == ' Testbrand ')]", Matchers.hasSize(0)));
	}
}
