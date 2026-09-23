package com.example.mi_bolt_backend.admin.catalog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.catalog.CatalogImageRepository;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;
import com.jayway.jsonpath.JsonPath;

/**
 * An admin image change reaches the shop: detail and list carry the new media URL with
 * no-cache, and the replaced image, now used by no product, is still served (MIM-348).
 * Each test creates its own product so the 3-product fixture (ids 1-3) is never touched.
 */
@IntegrationTest
class ShopImageChangeTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private CatalogImageRepository catalogImageRepository;

	private final List<Long> createdProductIds = new ArrayList<>();
	private final List<String> createdImageIds = new ArrayList<>();

	@AfterEach
	void deleteCreatedRows() {
		for (Long id : createdProductIds) {
			AdminProductInputs.delete(jdbc, id);
		}
		catalogImageRepository.deleteAllById(createdImageIds);
		createdProductIds.clear();
		createdImageIds.clear();
	}

	private static String body(String slug, String name, String whiteImageId) {
		return """
				{"slug":"%s","brand":"Testbrand","name":"%s","description":"A phone made for a test.",
				"is5g":true,"releasedAt":"2026-01-15","rank":90,"popularityScore":10,"featured":false,
				"highlights":["Long battery"],
				"colors":[{"code":"black","name":"Fekete","swatchHex":"#000000","imageId":"%s","alt":"Test phone, black"},
				{"code":"white","name":"Fehér","swatchHex":"#FFFFFF","imageId":"%s","alt":"Test phone, white"}],
				"variants":[{"slug":"%s-black-128","colorCode":"black","storageGb":128,"price":{"amount":99990,"currency":"HUF"},"stock":5},
				{"slug":"%s-white-128","colorCode":"white","storageGb":128,"price":{"amount":99990,"currency":"HUF"},"stock":5},
				{"slug":"%s-white-256","colorCode":"white","storageGb":256,"price":{"amount":129990,"currency":"HUF"},"stock":3}],
				"specGroups":[{"title":"Kijelző","rows":[{"label":"Méret","value":"6,1 hüvelyk"}]}]}
				""".formatted(slug, name, AdminProductInputs.IMAGE_ID, whiteImageId, slug, slug, slug);
	}

	private static byte[] png(int width, int height) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	private String upload(AdminLogin.Signed signed, byte[] png) throws Exception {
		MvcResult result = mockMvc
				.perform(multipart("/admin/media").file(new MockMultipartFile("file", "swap.png", "image/png", png)).with(signed))
				.andExpect(status().isCreated())
				.andReturn();
		String id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");
		createdImageIds.add(id);
		return id;
	}

	private long createAndSwapWhite(AdminLogin.Signed signed, String slug, String name, String oldImageId, String newImageId) throws Exception {
		MvcResult result = mockMvc
				.perform(post("/admin/products").with(signed).contentType(MediaType.APPLICATION_JSON)
						.content(body(slug, name, oldImageId)))
				.andExpect(status().isCreated())
				.andReturn();
		Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");
		createdProductIds.add(id.longValue());

		mockMvc.perform(put("/admin/products/" + id).with(signed).contentType(MediaType.APPLICATION_JSON)
						.header("If-Match", "\"0\"").content(body(slug, name, newImageId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.colors[1].code").value("white"))
				.andExpect(jsonPath("$.colors[1].image.id").value(newImageId));

		return id.longValue();
	}

	// Fails if getProduct stops answering no-cache (ProductsController.java:55), the replace stops reaching the shop detail, or an image no product uses any more stops being served.
	@Test
	void aSwappedColourImageReachesTheShopDetail() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String oldId = upload(signed, png(9, 6));
		String newId = upload(signed, png(9, 4));
		createAndSwapWhite(signed, "b15-detail", "Image Swap Detail", oldId, newId);

		mockMvc.perform(get("/products/b15-detail"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(jsonPath("$.variants[?(@.id=='b15-detail--white--128')].images[0].src").value("/api/v1/media/" + newId))
				.andExpect(jsonPath("$.variants[?(@.id=='b15-detail--white--256')].images[0].src").value("/api/v1/media/" + newId))
				.andExpect(jsonPath("$.variants[?(@.id=='b15-detail--black--128')].images[0].src")
						.value("/api/v1/media/" + AdminProductInputs.IMAGE_ID));

		mockMvc.perform(get("/media/" + oldId))
				.andExpect(status().isOk())
				.andExpect(content().contentType("image/png"));

		mockMvc.perform(get("/media/" + newId))
				.andExpect(status().isOk())
				.andExpect(content().contentType("image/png"));
	}

	// Fails if listProducts stops answering no-cache (ProductsController.java:49) or the replace stops reaching the shop list.
	@Test
	void aSwappedColourImageReachesTheShopList() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String oldId = upload(signed, png(9, 7));
		String newId = upload(signed, png(9, 5));
		createAndSwapWhite(signed, "b15-list", "Image Swap List", oldId, newId);

		mockMvc.perform(get("/products").param("q", "image swap list").param("color", "white"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(jsonPath("$.total").value(2))
				.andExpect(jsonPath("$.items[0].image.src").value("/api/v1/media/" + newId))
				.andExpect(jsonPath("$.items[1].image.src").value("/api/v1/media/" + newId));

		mockMvc.perform(get("/products").param("q", "image swap list").param("color", "black"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.items[0].image.src").value("/api/v1/media/" + AdminProductInputs.IMAGE_ID));
	}
}
