package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Pure-DTO validator tests: no Spring context, no database. Every rule from
 * the T4 brief that the loader would reject on a real boot is exercised here
 * so the message names the offending product, variant or file.
 */
class CatalogValidatorTest {

	private final CatalogValidator validator = new CatalogValidator();

	@Test
	void duplicateVariantSlugIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		product.getVariants().get(0).setSlug("sotetkek-256gb");
		product.getVariants().get(1).setSlug("sotetkek-256gb");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("duplicate variant slug");
	}

	@Test
	void unknownColorCodeIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		product.getVariants().get(0).setColorCode("phantom");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("unknown colorCode 'phantom'");
	}

	@Test
	void storageGbOutsideAllowedSetIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		product.getVariants().get(0).setStorageGb(999);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("storageGb must be 128, 256 or 512");
	}

	@Test
	void missingImageFileIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		// validCatalog does not write any image file on disk

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("not found");
	}

	@Test
	void hashMismatchIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		ColorDto color = product.getColors().get(0);
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		String declaredName = color.getImage().getFile();
		// write arbitrary bytes whose SHA-256 will not match the declared name
		Files.write(imagesDir.resolve(declaredName), new byte[] { 1, 2, 3, 4 });

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("SHA-256 mismatch");
	}

	@Test
	void unsupportedExtensionIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto product = catalog.getProducts().get(0);
		ColorDto color = product.getColors().get(0);
		color.getImage().setFile("something.bmp");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("unsupported extension");
	}

	@Test
	void moreThanFourFeaturedIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		for (int i = 0; i < 5; i++) {
			ProductDto extra = cloneProduct(catalog.getProducts().get(0), "extra-" + i);
			extra.setFeatured(true);
			catalog.getProducts().add(extra);
		}

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("at most 4 products may be featured");
	}

	@Test
	void duplicateProductSlugIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		ProductDto dup = cloneProduct(catalog.getProducts().get(0), catalog.getProducts().get(0).getSlug());
		catalog.getProducts().add(dup);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("duplicate product slug");
	}

	@Test
	void emptyHighlightsIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).setHighlights(List.of());

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("highlights must be 1-6");
	}

	@Test
	void validCatalogReturnsValidatedCatalog(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		for (ColorDto color : product.getColors()) {
			byte[] payload = color.getImage().getAlt().getBytes();
			String sha = CatalogValidator.sha256Hex(payload);
			String ext = "png";
			color.getImage().setFile(sha + "." + ext);
			Files.write(imagesDir.resolve(color.getImage().getFile()), payload);
		}

		CatalogValidator.ValidatedCatalog validated = validator.validate(catalog, imagesDir);

		assertThat(validated.getProducts()).hasSize(1);
		assertThat(validated.getImagesBySha()).hasSize(1);
	}

	@Test
	void sha256HexWrapsMissingAlgorithmAsIllegalState() {
		assertThatThrownBy(() -> CatalogValidator.sha256Hex("no-such-algorithm-xyz", new byte[] { 1, 2, 3 }))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("no-such-algorithm-xyz not available");
	}

	@Test
	void sharedShaWithDifferentWidthIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		ColorDto first = product.getColors().get(0);
		String sharedAlt = first.getImage().getAlt();
		byte[] payload = sharedAlt.getBytes();
		String sha = CatalogValidator.sha256Hex(payload);
		first.getImage().setFile(sha + ".png");
		first.getImage().setWidth(800);
		first.getImage().setHeight(800);
		Files.write(imagesDir.resolve(first.getImage().getFile()), payload);

		ColorDto second = new ColorDto();
		second.setCode("silver");
		second.setName("Silver");
		second.setSwatchHex("#C0C0C0");
		ImageDto secondImage = new ImageDto();
		secondImage.setFile(sha + ".png");
		secondImage.setAlt("Test Phone silver");
		secondImage.setWidth(900);
		secondImage.setHeight(800);
		second.setImage(secondImage);
		product.getColors().add(second);

		VariantDto v = new VariantDto();
		v.setId("test-phone--silver--256");
		v.setSlug("ezust-256gb");
		v.setColorCode("silver");
		v.setStorageGb(256);
		v.setPriceHuf(349990);
		v.setStock(5);
		product.getVariants().add(v);

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("shares image '" + sha + "'")
				.hasMessageContaining("different width");
	}

	@Test
	void sharedShaWithDifferentHeightIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		ColorDto first = product.getColors().get(0);
		String sharedAlt = first.getImage().getAlt();
		byte[] payload = sharedAlt.getBytes();
		String sha = CatalogValidator.sha256Hex(payload);
		first.getImage().setFile(sha + ".png");
		first.getImage().setWidth(800);
		first.getImage().setHeight(800);
		Files.write(imagesDir.resolve(first.getImage().getFile()), payload);

		ColorDto second = new ColorDto();
		second.setCode("silver");
		second.setName("Silver");
		second.setSwatchHex("#C0C0C0");
		ImageDto secondImage = new ImageDto();
		secondImage.setFile(sha + ".png");
		secondImage.setAlt("Test Phone silver");
		secondImage.setWidth(800);
		secondImage.setHeight(900);
		second.setImage(secondImage);
		product.getColors().add(second);

		VariantDto v = new VariantDto();
		v.setId("test-phone--silver--256");
		v.setSlug("ezust-256gb");
		v.setColorCode("silver");
		v.setStorageGb(256);
		v.setPriceHuf(349990);
		v.setStock(5);
		product.getVariants().add(v);

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("shares image '" + sha + "'")
				.hasMessageContaining("different height");
	}

	@Test
	void sharedShaWithDifferentExtensionIsRejected(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		ColorDto first = product.getColors().get(0);
		String sharedAlt = first.getImage().getAlt();
		byte[] payload = sharedAlt.getBytes();
		String sha = CatalogValidator.sha256Hex(payload);
		first.getImage().setFile(sha + ".png");
		first.getImage().setWidth(800);
		first.getImage().setHeight(800);
		Files.write(imagesDir.resolve(first.getImage().getFile()), payload);

		ColorDto second = new ColorDto();
		second.setCode("silver");
		second.setName("Silver");
		second.setSwatchHex("#C0C0C0");
		ImageDto secondImage = new ImageDto();
		secondImage.setFile(sha + ".jpg");
		secondImage.setAlt("Test Phone silver");
		secondImage.setWidth(800);
		secondImage.setHeight(800);
		second.setImage(secondImage);
		product.getColors().add(second);
		Files.write(imagesDir.resolve(secondImage.getFile()), payload);

		VariantDto v = new VariantDto();
		v.setId("test-phone--silver--256");
		v.setSlug("ezust-256gb");
		v.setColorCode("silver");
		v.setStorageGb(256);
		v.setPriceHuf(349990);
		v.setStock(5);
		product.getVariants().add(v);

		assertThatThrownBy(() -> validator.validate(catalog, imagesDir))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("shares image '" + sha + "'")
				.hasMessageContaining("different extension");
	}

	@Test
	void sharedShaWithDifferentAltIsAccepted(@TempDir Path tmp) throws IOException {
		CatalogDto catalog = validCatalog();
		Path imagesDir = tmp.resolve("images");
		Files.createDirectories(imagesDir);
		ProductDto product = catalog.getProducts().get(0);
		ColorDto first = product.getColors().get(0);
		String sharedAlt = first.getImage().getAlt();
		byte[] payload = sharedAlt.getBytes();
		String sha = CatalogValidator.sha256Hex(payload);
		first.getImage().setFile(sha + ".png");
		first.getImage().setWidth(800);
		first.getImage().setHeight(800);
		Files.write(imagesDir.resolve(first.getImage().getFile()), payload);

		ColorDto second = new ColorDto();
		second.setCode("silver");
		second.setName("Silver");
		second.setSwatchHex("#C0C0C0");
		ImageDto secondImage = new ImageDto();
		secondImage.setFile(sha + ".png");
		secondImage.setAlt("Test Phone silver — different alt for same image");
		secondImage.setWidth(800);
		secondImage.setHeight(800);
		second.setImage(secondImage);
		product.getColors().add(second);

		VariantDto v = new VariantDto();
		v.setId("test-phone--silver--256");
		v.setSlug("ezust-256gb");
		v.setColorCode("silver");
		v.setStorageGb(256);
		v.setPriceHuf(349990);
		v.setStock(5);
		product.getVariants().add(v);

		assertThat(validator.validate(catalog, imagesDir).getImagesBySha()).hasSize(1);
	}

	@Test
	void imageFileWithParentTraversalIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).getImage().setFile("../evil.png");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("'../evil.png'")
				.hasMessageContaining("must not contain '/', '\\' or '..'");
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("lengthCases")
	void fieldLengthLimitsAreEnforced(String name, FieldMutator mutator, String messageNeedle) {
		CatalogDto catalog = validCatalog();
		mutator.mutate(catalog);

		assertThatThrownBy(() -> validator.validate(catalog, Path.of("does-not-exist")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining(messageNeedle);
	}

	static Stream<Arguments> lengthCases() {
		String label121 = "l".repeat(121);
		return Stream.of(
				Arguments.of("brand>80",
						(FieldMutator) c -> c.getProducts().get(0).setBrand("b".repeat(81)),
						"brand is 81 chars, must be ≤ 80"),
				Arguments.of("colorCode>40",
						(FieldMutator) c -> c.getProducts().get(0).getColors().get(0).setCode("x".repeat(41)),
						"color code 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' is 41 chars, must be ≤ 40"),
				Arguments.of("colorName>80",
						(FieldMutator) c -> c.getProducts().get(0).getColors().get(0).setName("n".repeat(81)),
						"color 'navy' name is 81 chars, must be ≤ 80"),
				Arguments.of("colorAlt>280",
						(FieldMutator) c -> c.getProducts().get(0).getColors().get(0).getImage().setAlt("a".repeat(281)),
						"image alt is 281 chars, must be ≤ 280"),
				Arguments.of("variantSlug>120",
						(FieldMutator) c -> c.getProducts().get(0).getVariants().get(0).setSlug("s".repeat(121)),
						"slug is 121 chars, must be ≤ 120"),
				Arguments.of("specGroupTitle>120",
						(FieldMutator) c -> c.getProducts().get(0).getSpecGroups().get(0).setLabel("t".repeat(121)),
						"title is 121 chars, must be ≤ 120"),
				Arguments.of("specRowLabel>120",
						(FieldMutator) c -> c.getProducts().get(0).getSpecGroups().get(0).getRows().get(0).setLabel(label121),
						"row label '" + label121 + "' is 121 chars, must be ≤ 120"),
				Arguments.of("specRowValue>2000",
						(FieldMutator) c -> c.getProducts().get(0).getSpecGroups().get(0).getRows().get(0).setValue("v".repeat(2001)),
						"row value is 2001 chars, must be ≤ 2000"));
	}

	@FunctionalInterface
	interface FieldMutator {
		void mutate(CatalogDto catalog);
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

	@Test
	void blankColorCodeIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).setCode("  ");

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("color code is required");
	}

	@Test
	void nullColorCodeIsRejected(@TempDir Path tmp) {
		CatalogDto catalog = validCatalog();
		catalog.getProducts().get(0).getColors().get(0).setCode(null);

		assertThatThrownBy(() -> validator.validate(catalog, tmp.resolve("images")))
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("color code is required");
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
