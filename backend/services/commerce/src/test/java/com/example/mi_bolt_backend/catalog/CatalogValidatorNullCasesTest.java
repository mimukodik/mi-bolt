package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Coverage tests for the null, blank and {@code isEmpty} branches in
 * {@link CatalogValidator}. The structural rules live in
 * {@link CatalogValidatorTest}; this file owns the input-field guards.
 */
class CatalogValidatorNullCasesTest {

	private final CatalogValidator validator = new CatalogValidator();

	@Test
	void catalogProductsNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.setProducts(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("catalog.json has no products");
	}

	@Test
	void duplicateVariantIdAcrossCatalogueIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		ProductDto extra = cloneProduct(catalog.getProducts().get(0), "second");
		extra.getVariants().get(0).setId(catalog.getProducts().get(0).getVariants().get(0).getId());
		catalog.getProducts().add(extra);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("duplicate variant id");
	}

	@Test
	void productSlugNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setSlug(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("product slug");
	}

	@Test
	void productSlugInvalidPatternIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setSlug("Not Allowed");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("product slug");
	}

	@Test
	void productBrandBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setBrand("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("brand is required");
	}

	@Test
	void productNameBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setName("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("name is required");
	}

	@Test
	void productReleasedAtNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setReleasedAt(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("releasedAt is required");
	}

	@Test
	void productRankNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setRank(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("rank and popularityScore");
	}

	@Test
	void productDescriptionNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setDescription(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("description is required");
	}

	@Test
	void productSpecGroupsEmptyIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setSpecGroups(List.of());

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("at least one spec group");
	}

	@Test
	void specGroupRowsEmptyIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getSpecGroups().get(0).setRows(List.of());

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("has no rows");
	}

	@Test
	void productColorsEmptyIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setColors(List.of());

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("at least one color");
	}

	@Test
	void colorImageNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).setImage(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("has no image");
	}

	@Test
	void duplicateColorCodeWithinProductIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		ColorDto clone = new ColorDto();
		clone.setCode(product.getColors().get(0).getCode());
		clone.setName("Same");
		clone.setSwatchHex("#000000");
		clone.setImage(product.getColors().get(0).getImage());
		product.getColors().add(clone);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("duplicate color code");
	}

	@Test
	void productVariantsEmptyIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setVariants(List.of());

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("at least one variant");
	}

	@Test
	void variantIdBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getVariants().get(0).setId("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("variant has no id");
	}

	@Test
	void variantSlugInvalidPatternIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getVariants().get(0).setSlug("Bad Slug");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("slug must match");
	}

	@Test
	void colorImageFileNullIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		catalog.getProducts().get(0).getColors().get(0).getImage().setFile(null);

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("has no image file");
	}

	@Test
	void imageAltBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).getImage().setAlt("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("image alt is required");
	}

	@Test
	void imageWidthZeroIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).getImage().setWidth(0);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("image width must be > 0");
	}

	@Test
	void imageHeightZeroIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).getImage().setHeight(0);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("image height must be > 0");
	}

	@Test
	void variantIdShapeMismatchIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getVariants().get(0).setId("not-the-shape");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("must match test-phone--navy--256");
	}

	@Test
	void variantIdOver80CharsIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		String longSlug = "x".repeat(80);
		catalog.getProducts().get(0).setSlug(longSlug);
		catalog.getProducts().get(0).getVariants().get(0)
				.setId(longSlug + "--navy--256");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("must be ≤ 80");
	}

	@Test
	void variantIdShapeMatchPasses(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		for (ColorDto color : product.getColors()) {
			byte[] payload = color.getImage().getAlt().getBytes();
			String sha = CatalogValidator.sha256Hex(payload);
			color.getImage().setFile(sha + ".png");
			Files.write(imagesDir.resolve(color.getImage().getFile()), payload);
		}

		assertThat(validator.validate(catalog, imagesDir).getProducts()).hasSize(1);
	}

	@Test
	void variantStockNullIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getVariants().get(0).setStock(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("stock is required");
	}

	@Test
	void colorNameBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).setName("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("name is required");
	}

	@Test
	void colorSwatchHexInvalidIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).setSwatchHex("nope");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("swatchHex must match #RRGGBB");
	}

	@Test
	void highlightTextBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getHighlights().add("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("each highlight must be 1-");
	}

	@Test
	void highlightTextTooLongIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getHighlights().add("x".repeat(281));

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("each highlight must be 1-280");
	}

	@Test
	void productNameTooLongIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setName("x".repeat(201));

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("name is required and must be ≤ 200");
	}

	@Test
	void productDescriptionTooLongIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setDescription("x".repeat(2001));

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("description is required and must be ≤ 2000");
	}

	@Test
	void releasedAtUnparseableDateIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setReleasedAt("not-a-date");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("is not a valid date");
	}

	@Test
	void specGroupLabelBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getSpecGroups().get(0).setLabel("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("spec group label is required");
	}

	@Test
	void specRowLabelBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getSpecGroups().get(0).getRows().get(0).setLabel("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("row label is required");
	}

	@Test
	void specRowValueBlankIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getSpecGroups().get(0).getRows().get(0).setValue("");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("row value is required");
	}

	private static CatalogDto validCatalog() {
		CatalogDto catalog = new CatalogDto();
		ProductDto product = new ProductDto();
		product.setSlug("test-phone");
		product.setBrand("TestBrand");
		product.setName("Test Phone");
		product.setDescription("desc");
		product.setIs5g(true);
		product.setReleasedAt("2025-01-01");
		product.setRank(10);
		product.setPopularityScore(50);
		product.setFeatured(false);
		product.setHighlights(new ArrayList<>(List.of("one", "two")));
		product.setSpecGroups(new ArrayList<>(List.of(specGroup())));
		ColorDto color = new ColorDto();
		color.setCode("navy");
		color.setName("Navy");
		color.setSwatchHex("#1B2A49");
		ImageDto image = new ImageDto();
		image.setFile("anything.png");
		image.setAlt("alt");
		image.setWidth(800);
		image.setHeight(800);
		color.setImage(image);
		product.setColors(new ArrayList<>(List.of(color)));
		VariantDto v1 = variant("test-phone--navy--256", "sotetkek-256gb", "navy", 256, 349990, 5);
		VariantDto v2 = variant("test-phone--navy--128", "sotetkek-128gb", "navy", 128, 299990, 7);
		product.setVariants(new ArrayList<>(List.of(v1, v2)));
		catalog.setProducts(new ArrayList<>(List.of(product)));
		return catalog;
	}

	private static SpecGroupDto specGroup() {
		SpecGroupDto g = new SpecGroupDto();
		g.setLabel("Display");
		SpecRowDto row = new SpecRowDto();
		row.setLabel("Size");
		row.setValue("6.1\"");
		g.setRows(List.of(row));
		return g;
	}

	private static VariantDto variant(String id, String slug, String colorCode, int storage, long price, int stock) {
		VariantDto v = new VariantDto();
		v.setId(id);
		v.setSlug(slug);
		v.setColorCode(colorCode);
		v.setStorageGb(storage);
		v.setPriceHuf(price);
		v.setStock(stock);
		return v;
	}

	private static ProductDto cloneProduct(ProductDto src, String newSlug) {
		ProductDto copy = new ProductDto();
		copy.setSlug(newSlug);
		copy.setBrand(src.getBrand());
		copy.setName(src.getName());
		copy.setDescription(src.getDescription());
		copy.setIs5g(src.isIs5g());
		copy.setReleasedAt(src.getReleasedAt());
		copy.setRank(src.getRank());
		copy.setPopularityScore(src.getPopularityScore());
		copy.setFeatured(src.isFeatured());
		copy.setHighlights(src.getHighlights());
		copy.setSpecGroups(src.getSpecGroups());
		copy.setColors(src.getColors());
		List<VariantDto> variants = new ArrayList<>();
		for (VariantDto v : src.getVariants()) {
			VariantDto copyV = new VariantDto();
			copyV.setId(newSlug + "--" + v.getColorCode() + "--" + v.getStorageGb());
			copyV.setSlug(v.getSlug());
			copyV.setColorCode(v.getColorCode());
			copyV.setStorageGb(v.getStorageGb());
			copyV.setPriceHuf(v.getPriceHuf());
			copyV.setStock(v.getStock());
			variants.add(copyV);
		}
		copy.setVariants(variants);
		return copy;
	}
}
