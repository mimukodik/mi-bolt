package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;
import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

/**
 * {@code PUT /admin/products/{productId}} against the real chain. Every test creates its
 * own products so the 3-product fixture (ids 1-3) is never touched.
 */
@IntegrationTest
class AdminProductReplaceApiTest {

	private static final String SECOND_IMAGE_ID = "052fbcc4bbaa16e953edf6427e20fba34bb43601a5282b314177ee89d5b85062";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private CartRepository carts;

	private final List<Long> createdIds = new ArrayList<>();
	private final List<Long> createdCartIds = new ArrayList<>();

	@AfterEach
	void deleteCreatedProducts() {
		for (Long id : createdCartIds) {
			jdbc.update("delete from cart where id = ?", id);
		}
		createdCartIds.clear();
		for (Long id : createdIds) {
			AdminProductInputs.delete(jdbc, id);
		}
		createdIds.clear();
	}

	/** The create body plus a white colour (second) and a white 256 GB variant. */
	private static String twoPairBody(String slug) {
		return AdminProductInputs.body(slug, false)
				.replace("\"alt\":\"Test phone, black\"}]",
						"\"alt\":\"Test phone, black\"},{\"code\":\"white\",\"name\":\"Fehér\",\"swatchHex\":\"#FFFFFF\",\"imageId\":\""
								+ AdminProductInputs.IMAGE_ID + "\",\"alt\":\"Test phone, white\"}]")
				.replace("\"stock\":5}]",
						"\"stock\":5},{\"slug\":\"" + slug + "-white-256\",\"colorCode\":\"white\",\"storageGb\":256,"
								+ "\"price\":{\"amount\":129990,\"currency\":\"HUF\"},\"stock\":3}]");
	}

	/** Only the white colour and the white 256 GB variant: the black pair and colour are dropped. */
	private static String whiteOnlyBody(String slug) {
		return twoPairBody(slug)
				.replace("{\"code\":\"black\",\"name\":\"Fekete\",\"swatchHex\":\"#000000\",\"imageId\":\""
						+ AdminProductInputs.IMAGE_ID + "\",\"alt\":\"Test phone, black\"},", "")
				.replace("{\"slug\":\"" + slug + "-black-128\",\"colorCode\":\"black\",\"storageGb\":128,\n"
						+ "\"price\":{\"amount\":99990,\"currency\":\"HUF\"},\"stock\":5},", "");
	}

	private MockHttpServletRequestBuilder request(long id, AdminLogin.Signed signed, String ifMatch, String body) {
		MockHttpServletRequestBuilder builder = put("/admin/products/" + id)
				.with(signed)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body);
		if (ifMatch != null) {
			builder.header("If-Match", ifMatch);
		}
		return builder;
	}

	/** Adds {@code variantId} (quantity 1) to the cart the session cookie holds, and returns its cart id. */
	private long cartHolding(String cookie, String variantId) throws Exception {
		MvcResult getResult = mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andReturn();
		String etag = getResult.getResponse().getHeader("ETag");
		MvcResult postResult = mockMvc.perform(post("/cart/items")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", etag)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"variantId\":\"" + variantId + "\",\"quantity\":1}"))
				.andExpect(status().isOk())
				.andReturn();
		long cartId = Long.parseLong(JsonPath.read(postResult.getResponse().getContentAsString(), "$.id").toString());
		createdCartIds.add(cartId);
		return cartId;
	}

	private void expire(long cartId) {
		Cart persisted = carts.findById(cartId)
				.orElseThrow(() -> new IllegalStateException("expected a persisted cart for id " + cartId));
		OffsetDateTime now = OffsetDateTime.now();
		persisted.touch(now, now.minusSeconds(1));
		carts.save(persisted);
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn();
		String cookie = extractCookieValue(result.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "the first GET /cart must issue a Set-Cookie");
		return cookie;
	}

	private static String extractCookieValue(String setCookieHeader) {
		if (setCookieHeader == null) {
			return null;
		}
		int eq = setCookieHeader.indexOf('=');
		int semi = setCookieHeader.indexOf(';', eq);
		if (eq < 0 || semi < 0) {
			return null;
		}
		String value = setCookieHeader.substring(eq + 1, semi);
		return value.isBlank() ? null : value;
	}

	// Fails if replace stops requiring If-Match.
	@Test
	void replaceWithoutIfMatchIs428() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r1", false);
		createdIds.add(id);

		mockMvc.perform(request(id, signed, null, AdminProductInputs.body("b12-r1", false)))
				.andExpect(status().isPreconditionRequired())
				.andExpect(jsonPath("$.code").value("PRECONDITION_REQUIRED"))
				.andExpect(validAgainstContract());
	}

	// Fails if replace stops comparing If-Match with the stored version.
	@Test
	void replaceWithAStaleIfMatchIs412() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r2", false);
		createdIds.add(id);

		mockMvc.perform(request(id, signed, "\"7\"", AdminProductInputs.body("b12-r2", false)))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("PRODUCT_VERSION_CONFLICT"))
				.andExpect(jsonPath("$.params.expected").value(0))
				.andExpect(jsonPath("$.params.received").value(7))
				.andExpect(validAgainstContract());
	}

	// Fails if the generated @Pattern check on If-Match stops rejecting a malformed header before the controller.
	@Test
	void replaceWithAnUnquotedIfMatchIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r3", false);
		createdIds.add(id);

		mockMvc.perform(request(id, signed, "0", AdminProductInputs.body("b12-r3", false)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	// Fails if replace stops answering 404 for an unknown id.
	@Test
	void replaceOfAnUnknownIdIs404() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(request(999999, signed, "\"0\"", AdminProductInputs.body("b12-r4", false)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.params.productId").value(999999))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminProductsApi#replaceAdminProduct stops requiring the adminSession security scheme.
	@Test
	void replaceWithoutASessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(put("/admin/products/1")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session"))
						.header("If-Match", "\"0\"")
						.contentType(MediaType.APPLICATION_JSON)
						.content(AdminProductInputs.body("b12-r5", false)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	// Fails if replace stops applying the scalar members, or stops raising the version on a parent-only change.
	@Test
	void replaceChangingTheNameAnswers200WithTheNextEtag() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r6", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r6", false)
				.replace("\"name\":\"Test phone\"", "\"name\":\"Renamed phone\"");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(jsonPath("$.name").value("Renamed phone"))
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/products/" + id).with(signed))
				.andExpect(header().string("ETag", "\"1\""));
	}

	// Fails if product.setUpdatedAt is removed from replace: a child-only change would not raise the version.
	@Test
	void replaceChangingOnlyThePriceAnswers200WithTheNextEtag() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r7", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r7", false).replace("\"amount\":99990", "\"amount\":89990");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(jsonPath("$.variants[0].price.amount").value(89990))
				.andExpect(validAgainstContract());
	}

	// Fails if applyReplace stops keeping a kept pair's derived id, or stops updating its stock.
	@Test
	void replaceUpdatingAKeptPairKeepsItsDerivedId() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r8", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r8", false)
				.replace("\"amount\":99990", "\"amount\":89990")
				.replace("\"stock\":5", "\"stock\":7");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.variants.length()").value(1))
				.andExpect(jsonPath("$.variants[0].id").value("b12-r8--black--128"))
				.andExpect(jsonPath("$.variants[0].stock").value(7))
				.andExpect(validAgainstContract());
	}

	// Fails if applyReplace stops inserting a new (colour, storage) pair with its derived id.
	@Test
	void replaceAddingANewPairInsertsItsDerivedId() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r9", false);
		createdIds.add(id);
		String body = twoPairBody("b12-r9");
		assertThat(body).isNotEqualTo(AdminProductInputs.body("b12-r9", false));

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.variants.length()").value(2))
				.andExpect(jsonPath("$.variants[0].id").value("b12-r9--black--128"))
				.andExpect(jsonPath("$.variants[1].id").value("b12-r9--white--256"))
				.andExpect(jsonPath("$.colors.length()").value(2))
				.andExpect(jsonPath("$.colors[1].code").value("white"))
				.andExpect(validAgainstContract());
	}

	// Fails if the flush before the colour delete is removed (dropping a colour still referenced by a variant
	// hits the product_variant.color_id foreign key), or if dropVariants stops removing a dropped pair.
	@Test
	void replaceDroppingAPairDeletesTheVariantAndItsColour() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r10", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r10")))
				.andExpect(status().isOk());

		String whiteOnly = whiteOnlyBody("b12-r10");
		assertThat(whiteOnly).isNotEqualTo(twoPairBody("b12-r10"));

		mockMvc.perform(request(id, signed, "\"1\"", whiteOnly))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.variants.length()").value(1))
				.andExpect(jsonPath("$.variants[0].id").value("b12-r10--white--256"))
				.andExpect(jsonPath("$.colors.length()").value(1))
				.andExpect(jsonPath("$.colors[0].code").value("white"))
				.andExpect(validAgainstContract());

		assertThat(jdbc.queryForObject("select count(*) from product_variant where id = ?", Integer.class,
				"b12-r10--black--128")).isEqualTo(0);
		assertThat(jdbc.queryForObject(
				"select count(*) from product_color where product_id = ? and code = 'black'", Integer.class, id))
				.isEqualTo(0);
	}

	// Fails if applyColor stops updating a kept colour's image.
	@Test
	void replaceSwitchingAColourImageUpdatesIt() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r11", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r11", false).replace(AdminProductInputs.IMAGE_ID, SECOND_IMAGE_ID);

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.colors[0].image.id").value(SECOND_IMAGE_ID))
				.andExpect(validAgainstContract());
	}

	// Fails if the SLUG_IMMUTABLE check is removed.
	@Test
	void replaceChangingTheSlugIs422SlugImmutable() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r12", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r12", false).replace("\"slug\":\"b12-r12\"", "\"slug\":\"b12-other\"");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/slug"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SLUG_IMMUTABLE"))
				.andExpect(validAgainstContract());
	}

	// Fails if the FEATURED_LIMIT check on replace is removed.
	@Test
	void replaceMakingAFifthProductFeaturedIs422FeaturedLimit() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-f1", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-f2", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-f3", true));
		long id = AdminProductInputs.create(mockMvc, signed, "b12-f4", false);
		createdIds.add(id);

		mockMvc.perform(request(id, signed, "\"0\"", AdminProductInputs.body("b12-f4", true)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/featured"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("FEATURED_LIMIT"))
				.andExpect(jsonPath("$.fieldErrors[0].params.max").value(4))
				.andExpect(validAgainstContract());
	}

	// Fails if replace stops skipping the featured-limit check for a product that is already featured.
	@Test
	void replaceKeepingAFeaturedProductAtTheLimitAnswers200() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-f1", true);
		createdIds.add(id);
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-f2", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-f3", true));
		String body = AdminProductInputs.body("b12-f1", true)
				.replace("\"name\":\"Test phone\"", "\"name\":\"Renamed phone\"");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(validAgainstContract());
	}

	// Fails if the UNKNOWN_IMAGE check is removed.
	@Test
	void replaceWithAnUnknownImageIs422UnknownImage() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r15", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r15", false).replace(AdminProductInputs.IMAGE_ID, "0".repeat(64));

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/colors/0/imageId"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("UNKNOWN_IMAGE"))
				.andExpect(validAgainstContract());
	}

	// Fails if the DataIntegrityViolationException catch in replace is removed: swapping two variant slugs in
	// one replace must be refused rather than engineered around (docs/decisions/0020, "Consequences").
	@Test
	void replaceSwappingTwoVariantSlugsIs409CatalogConstraintConflict() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r16", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r16")))
				.andExpect(status().isOk());

		String swapped = twoPairBody("b12-r16")
				.replace("\"slug\":\"b12-r16-black-128\"", "\"slug\":\"SWAP\"")
				.replace("\"slug\":\"b12-r16-white-256\"", "\"slug\":\"b12-r16-black-128\"")
				.replace("\"slug\":\"SWAP\"", "\"slug\":\"b12-r16-white-256\"");

		mockMvc.perform(request(id, signed, "\"1\"", swapped))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CATALOG_CONSTRAINT_CONFLICT"))
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/products/" + id).with(signed))
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.variants[0].slug").value("b12-r16-black-128"));
	}

	// Fails if applyReplace stops stripping brand and name.
	@Test
	void replaceStoresFreeTextStripped() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r17", false);
		createdIds.add(id);
		String body = AdminProductInputs.body("b12-r17", false)
				.replace("\"brand\":\"Testbrand\"", "\"brand\":\"  Testbrand  \"")
				.replace("\"name\":\"Test phone\"", "\"name\":\"\\tTest phone \"");

		mockMvc.perform(request(id, signed, "\"0\"", body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.brand").value("Testbrand"))
				.andExpect(jsonPath("$.name").value("Test phone"))
				.andExpect(validAgainstContract());
	}

	// Fails if the VARIANT_IN_CART check on replace is removed, or if a dropped variant's cart line
	// is deleted before that check runs.
	@Test
	void replaceDroppingALiveCartHeldVariantIs409VariantInCart() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r18", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r18")))
				.andExpect(status().isOk());
		String cookie = newSession();
		cartHolding(cookie, "b12-r18--black--128");

		mockMvc.perform(request(id, signed, "\"1\"", whiteOnlyBody("b12-r18")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VARIANT_IN_CART"))
				.andExpect(jsonPath("$.params.variantIds.length()").value(1))
				.andExpect(jsonPath("$.params.variantIds[0]").value("b12-r18--black--128"))
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/products/" + id).with(signed))
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.variants.length()").value(2));
		assertThat(jdbc.queryForObject("select count(*) from cart_item where variant_id = ?", Integer.class,
				"b12-r18--black--128")).isEqualTo(1);
	}

	// Fails if the deleteLinesInExpiredCarts call is removed, or if it deletes the cart row itself
	// rather than just the line, which would rob the shopper of the one-time 410 CART_EXPIRED.
	@Test
	void replaceDroppingAnExpiredCartHeldVariantSucceedsAndKeepsTheOneTime410() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r19", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r19")))
				.andExpect(status().isOk());
		String cookie = newSession();
		long cartId = cartHolding(cookie, "b12-r19--black--128");
		expire(cartId);

		mockMvc.perform(request(id, signed, "\"1\"", whiteOnlyBody("b12-r19")))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.variants.length()").value(1));

		assertThat(jdbc.queryForObject("select count(*) from cart_item where variant_id = ?", Integer.class,
				"b12-r19--black--128")).isEqualTo(0);
		assertThat(jdbc.queryForObject("select count(*) from cart where id = ?", Integer.class, cartId)).isEqualTo(1);

		mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.code").value("CART_EXPIRED"));
		mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(0));
	}

	// Fails if the check runs after a write: an expired holder's line must not be deleted while a
	// live holder still blocks the whole replace.
	@Test
	void replaceWithALiveAndAnExpiredHolderIs409AndDeletesNeitherLine() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r20", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r20")))
				.andExpect(status().isOk());
		String liveCookie = newSession();
		cartHolding(liveCookie, "b12-r20--black--128");
		String expiredCookie = newSession();
		long expiredCartId = cartHolding(expiredCookie, "b12-r20--black--128");
		expire(expiredCartId);

		mockMvc.perform(request(id, signed, "\"1\"", whiteOnlyBody("b12-r20")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VARIANT_IN_CART"));

		assertThat(jdbc.queryForObject("select count(*) from cart_item where variant_id = ?", Integer.class,
				"b12-r20--black--128")).isEqualTo(2);
	}

	// Fails if the VARIANT_IN_CART check blocks on a kept variant, not only a dropped one.
	@Test
	void replaceKeepingAVariantHeldByALiveCartAnswers200() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r21", false);
		createdIds.add(id);
		mockMvc.perform(request(id, signed, "\"0\"", twoPairBody("b12-r21")))
				.andExpect(status().isOk());
		String cookie = newSession();
		cartHolding(cookie, "b12-r21--white--256");

		mockMvc.perform(request(id, signed, "\"1\"", whiteOnlyBody("b12-r21")))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""));

		assertThat(jdbc.queryForObject("select count(*) from cart_item where variant_id = ?", Integer.class,
				"b12-r21--white--256")).isEqualTo(1);
	}

	// Fails if the "&& product.getArchivedAt() == null" term in addsFeatured is removed (the B12a
	// review's open item: addsFeatured had no test for an archived product at the featured limit).
	@Test
	void replaceMakingAnArchivedProductFeaturedAtTheLimitAnswers200() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-r22a", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-r22b", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b12-r22c", true));
		long id = AdminProductInputs.create(mockMvc, signed, "b12-r22", false);
		createdIds.add(id);
		mockMvc.perform(post("/admin/products/" + id + "/archive").with(signed).header("If-Match", "\"0\""))
				.andExpect(status().isOk());

		mockMvc.perform(request(id, signed, "\"1\"", AdminProductInputs.body("b12-r22", true)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.featured").value(true))
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(validAgainstContract());
	}
}
