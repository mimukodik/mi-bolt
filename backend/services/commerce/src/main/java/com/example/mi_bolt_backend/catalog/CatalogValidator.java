package com.example.mi_bolt_backend.catalog;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Validates a parsed {@link CatalogDto} against the rules in the T4 brief and
 * loads each referenced image from disk, returning the bytes together with
 * the resolved content type and dimensions. Every rule violation throws
 * {@link CatalogValidationException} with a message that names the product,
 * variant or file so the operator can locate the broken entry fast.
 *
 * <p>Validation runs in two phases. Phase (a) is structural and touches only
 * the DTO: product slug pattern + uniqueness, variant id shape and uniqueness,
 * variant slug pattern + uniqueness inside the product, storageGb ∈ {128,256,512},
 * colorCode known inside the product, color and image fields present and valid,
 * highlights 1-6 with non-blank ≤ 280 chars, ≥1 spec group with ≥1 row,
 * {@code releasedAt} parseable as ISO date, every colour has a non-blank alt
 * and width/height ≥ 1, plus the column-length checks for brand, color code,
 * color name, variant slug, spec group title, spec row label and value.
 * Phase (b) is image checks on disk and runs only when (a) passes, so an
 * image-rule failure never masks a structural-rule failure and vice versa.
 * The DTO is never mutated: the resolved sha and dimensions are kept on
 * {@link ValidatedCatalog}. Alt text belongs to the colour, not the image:
 * two colours (even of different products) may share the same image bytes
 * and dimensions but with their own alt text (see docs/decisions/0007).
 */
@Component
public class CatalogValidator {

	public static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
	public static final Pattern SWATCH_HEX = Pattern.compile("^#[0-9A-Fa-f]{6}$");
	public static final Set<Integer> ALLOWED_STORAGE = Set.of(128, 256, 512);
	private static final Pattern PROMOTION_TIME = Pattern.compile(
			"^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:[Zz]|[+-][0-9]{2}:[0-9]{2})$");
	private static final Set<String> ALLOWED_EXTENSIONS = Set.of("webp", "jpg", "png");
	private static final Map<String, String> EXT_TO_CONTENT_TYPE = Map.of(
			"webp", "image/webp",
			"jpg", "image/jpeg",
			"png", "image/png");

	public static final int MAX_BRAND = 80;
	public static final int MAX_PRODUCT_NAME = 200;
	public static final int MAX_HIGHLIGHT = 280;
	public static final int MAX_DESCRIPTION = 2000;
	public static final int MAX_VARIANT_ID = 80;
	public static final int MAX_VARIANT_SLUG = 120;
	public static final int MAX_COLOR_CODE = 40;
	public static final int MAX_COLOR_NAME = 80;
	public static final int MAX_COLOR_ALT = 280;
	public static final int MAX_SPEC_GROUP_TITLE = 120;
	public static final int MAX_SPEC_ROW_LABEL = 120;
	public static final int MAX_SPEC_ROW_VALUE = 2000;

	public ValidatedCatalog validate(CatalogDto catalog, Path imagesDir) {
		if (catalog.getProducts() == null || catalog.getProducts().isEmpty()) {
			throw new CatalogValidationException("catalog.json has no products");
		}

		Map<String, byte[]> imagesBySha = new HashMap<>();
		Map<String, String> contentTypeBySha = new HashMap<>();
		Map<String, Integer> widthBySha = new HashMap<>();
		Map<String, Integer> heightBySha = new HashMap<>();
		Map<String, ProductDto> slugIndex = new HashMap<>();
		Map<String, VariantDto> variantIdIndex = new HashMap<>();
		int featuredCount = 0;

		// (a) Structural rules on the DTO only.
		for (ProductDto product : catalog.getProducts()) {
			validateProductBasics(product);
			validateHighlights(product);
			validateSpecGroups(product);
			validateColors(product);
			validateVariants(product);
			validatePromotion(product);
			if (product.isFeatured()) {
				featuredCount++;
				if (featuredCount > 4) {
					throw new CatalogValidationException(
							"product " + product.getSlug()
									+ ": at most 4 products may be featured");
				}
			}
			if (slugIndex.put(product.getSlug(), product) != null) {
				throw new CatalogValidationException(
						"duplicate product slug: " + product.getSlug());
			}
			for (VariantDto variant : product.getVariants()) {
				if (variantIdIndex.put(variant.getId(), variant) != null) {
					throw new CatalogValidationException(
							"product " + product.getSlug()
									+ ": duplicate variant id '" + variant.getId() + "'");
				}
				String expectedId = product.getSlug() + "--" + variant.getColorCode() + "--"
						+ variant.getStorageGb();
				if (!variant.getId().equals(expectedId)) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": variant id '"
									+ variant.getId() + "' must match " + expectedId);
				}
				if (expectedId.length() > MAX_VARIANT_ID) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": variant id '"
									+ expectedId + "' is " + expectedId.length()
									+ " chars, must be ≤ " + MAX_VARIANT_ID);
				}
			}
		}

		// (b) Image checks on disk — only after (a) passes.
		for (ProductDto product : catalog.getProducts()) {
			loadImages(product, imagesDir, imagesBySha, contentTypeBySha,
					widthBySha, heightBySha);
		}

		return new ValidatedCatalog(catalog.getProducts(), imagesBySha, contentTypeBySha,
				widthBySha, heightBySha);
	}

	private static void validateProductBasics(ProductDto product) {
		if (product.getSlug() == null || !SLUG.matcher(product.getSlug()).matches()) {
			throw new CatalogValidationException(
					"product slug '" + product.getSlug() + "' must match " + SLUG.pattern());
		}
		if (product.getBrand() == null || product.getBrand().isBlank()) {
			throw new CatalogValidationException("product " + product.getSlug() + ": brand is required");
		}
		if (product.getBrand().length() > MAX_BRAND) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": brand is " + product.getBrand().length()
							+ " chars, must be ≤ " + MAX_BRAND);
		}
		if (product.getName() == null || product.getName().isBlank()
				|| product.getName().length() > MAX_PRODUCT_NAME) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": name is required and must be ≤ "
							+ MAX_PRODUCT_NAME + " chars");
		}
		if (product.getReleasedAt() == null) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": releasedAt is required");
		}
		try {
			LocalDate.parse(product.getReleasedAt());
		}
		catch (DateTimeParseException e) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": releasedAt '"
							+ product.getReleasedAt() + "' is not a valid date", e);
		}
		if (product.getRank() == null || product.getPopularityScore() == null) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": rank and popularityScore are required");
		}
		if (product.getDescription() == null
				|| product.getDescription().length() > MAX_DESCRIPTION) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": description is required and must be ≤ "
							+ MAX_DESCRIPTION + " chars");
		}
	}

	private static void validateHighlights(ProductDto product) {
		int n = product.getHighlights() == null ? 0 : product.getHighlights().size();
		if (n < 1 || n > 6) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": highlights must be 1-6, found " + n);
		}
		for (String text : product.getHighlights()) {
			if (text == null || text.isBlank() || text.length() > MAX_HIGHLIGHT) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": each highlight must be 1-"
								+ MAX_HIGHLIGHT + " chars");
			}
		}
	}

	private static void validateSpecGroups(ProductDto product) {
		if (product.getSpecGroups() == null || product.getSpecGroups().isEmpty()) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": at least one spec group is required");
		}
		for (SpecGroupDto group : product.getSpecGroups()) {
			if (group.getLabel() == null || group.getLabel().isBlank()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": spec group label is required");
			}
			if (group.getLabel().length() > MAX_SPEC_GROUP_TITLE) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": spec group '" + group.getLabel()
								+ "' title is " + group.getLabel().length() + " chars, must be ≤ "
								+ MAX_SPEC_GROUP_TITLE);
			}
			if (group.getRows() == null || group.getRows().isEmpty()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": spec group '" + group.getLabel()
								+ "' has no rows");
			}
			for (SpecRowDto row : group.getRows()) {
				if (row.getLabel() == null || row.getLabel().isBlank()) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": spec group '" + group.getLabel()
									+ "' row label is required");
				}
				if (row.getLabel().length() > MAX_SPEC_ROW_LABEL) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": spec group '" + group.getLabel()
									+ "' row label '" + row.getLabel() + "' is "
									+ row.getLabel().length() + " chars, must be ≤ "
									+ MAX_SPEC_ROW_LABEL);
				}
				if (row.getValue() == null || row.getValue().isBlank()) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": spec group '" + group.getLabel()
									+ "' row value is required");
				}
				if (row.getValue().length() > MAX_SPEC_ROW_VALUE) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": spec group '" + group.getLabel()
									+ "' row value is " + row.getValue().length()
									+ " chars, must be ≤ " + MAX_SPEC_ROW_VALUE);
				}
			}
		}
	}

	private static void validateColors(ProductDto product) {
		if (product.getColors() == null || product.getColors().isEmpty()) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": at least one color is required");
		}
		Map<String, ColorDto> seen = new HashMap<>();
		for (ColorDto color : product.getColors()) {
			if (color.getCode() == null || color.getCode().isBlank()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color code is required");
			}
			if (color.getCode().length() > MAX_COLOR_CODE) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color code '" + color.getCode()
								+ "' is " + color.getCode().length() + " chars, must be ≤ "
								+ MAX_COLOR_CODE);
			}
			if (color.getName() == null || color.getName().isBlank()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' name is required");
			}
			if (color.getName().length() > MAX_COLOR_NAME) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' name is " + color.getName().length()
								+ " chars, must be ≤ " + MAX_COLOR_NAME);
			}
			if (color.getSwatchHex() == null
					|| !SWATCH_HEX.matcher(color.getSwatchHex()).matches()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' swatchHex must match #RRGGBB");
			}
			if (color.getImage() == null) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' has no image");
			}
			if (color.getImage().getAlt() == null || color.getImage().getAlt().isBlank()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' image alt is required");
			}
			if (color.getImage().getAlt().length() > MAX_COLOR_ALT) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' image alt is " + color.getImage().getAlt().length()
								+ " chars, must be ≤ " + MAX_COLOR_ALT);
			}
			Integer width = color.getImage().getWidth();
			if (width == null || width <= 0) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' image width must be > 0");
			}
			Integer height = color.getImage().getHeight();
			if (height == null || height <= 0) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' image height must be > 0");
			}
			if (seen.put(color.getCode(), color) != null) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": duplicate color code '"
								+ color.getCode() + "'");
			}
		}
	}

	private static void validateVariants(ProductDto product) {
		if (product.getVariants() == null || product.getVariants().isEmpty()) {
			throw new CatalogValidationException(
					"product " + product.getSlug() + ": at least one variant is required");
		}
		Map<String, ColorDto> colorIndex = new HashMap<>();
		for (ColorDto color : product.getColors()) {
			colorIndex.put(color.getCode(), color);
		}
		Map<String, VariantDto> slugsInside = new HashMap<>();
		for (VariantDto variant : product.getVariants()) {
			if (variant.getId() == null || variant.getId().isBlank()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant has no id");
			}
			if (variant.getSlug() == null || !SLUG.matcher(variant.getSlug()).matches()) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant '" + variant.getId()
								+ "' slug must match " + SLUG.pattern());
			}
			if (variant.getSlug().length() > MAX_VARIANT_SLUG) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant '" + variant.getId()
								+ "' slug is " + variant.getSlug().length()
								+ " chars, must be ≤ " + MAX_VARIANT_SLUG);
			}
			if (slugsInside.put(variant.getSlug(), variant) != null) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": duplicate variant slug '"
								+ variant.getSlug() + "'");
			}
			if (!ALLOWED_STORAGE.contains(variant.getStorageGb())) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant '" + variant.getId()
								+ "' storageGb must be 128, 256 or 512, got "
								+ variant.getStorageGb());
			}
			if (!colorIndex.containsKey(variant.getColorCode())) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant '" + variant.getId()
								+ "' references unknown colorCode '" + variant.getColorCode() + "'");
			}
			if (variant.getSalePriceHuf() != null
					&& (variant.getSalePriceHuf() < 1 || variant.getSalePriceHuf() > 100_000_000)) {
				throw new CatalogValidationException("product " + product.getSlug() + ": variant "
						+ variant.getId() + ": salePriceHuf must be between 1 and 100000000");
			}
			if (variant.getStock() == null) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": variant '" + variant.getId()
								+ "' stock is required");
			}
		}
	}


	private static void validatePromotion(ProductDto product) {
		PromotionDto promotion = product.getPromotion();
		if (promotion == null) {
			return;
		}
		String prefix = "product " + product.getSlug() + ": promotion ";
		if (promotion.enabled() == null) {
			throw new CatalogValidationException(prefix + "enabled is required");
		}
		if (promotion.text() != null && promotion.text().length() > 280) {
			throw new CatalogValidationException(prefix + "text must be at most 280 chars");
		}
		OffsetDateTime startsAt = promotionTime(promotion.startsAt(), prefix + "startsAt");
		OffsetDateTime endsAt = promotionTime(promotion.endsAt(), prefix + "endsAt");
		if (startsAt != null && endsAt != null && !startsAt.isBefore(endsAt)) {
			throw new CatalogValidationException(prefix + "startsAt must be before endsAt");
		}
		if (Boolean.TRUE.equals(promotion.enabled())) {
			if (promotion.text() == null || promotion.text().isBlank() || startsAt == null || endsAt == null) {
				throw new CatalogValidationException(prefix + "enabled requires text, startsAt and endsAt");
			}
			if (product.getVariants().stream().noneMatch(variant -> variant.getSalePriceHuf() != null)) {
				throw new CatalogValidationException(prefix + "enabled requires at least one variant salePriceHuf");
			}
		}
	}

	private static OffsetDateTime promotionTime(String value, String field) {
		if (value == null) {
			return null;
		}
		if (!PROMOTION_TIME.matcher(value).matches()) {
			throw new CatalogValidationException(field + " must be a valid date-time with an explicit offset");
		}
		try {
			return OffsetDateTime.parse(value);
		}
		catch (DateTimeParseException exception) {
			throw new CatalogValidationException(field + " must be a valid date-time with an explicit offset", exception);
		}
	}

	private static void loadImages(ProductDto product, Path imagesDir,
			Map<String, byte[]> imagesBySha, Map<String, String> contentTypeBySha,
			Map<String, Integer> widthBySha, Map<String, Integer> heightBySha) {
		for (ColorDto color : product.getColors()) {
			String file = color.getImage().getFile();
			if (file == null) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' has no image file");
			}
			if (file.contains("/") || file.contains("\\") || file.contains("..")) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": color '" + color.getCode()
								+ "' image file '" + file + "' must not contain '/', '\\' or '..'");
			}
			String ext = extensionOf(file);
			if (!ALLOWED_EXTENSIONS.contains(ext)) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": image file '" + file
								+ "' has unsupported extension, must be one of "
								+ ALLOWED_EXTENSIONS);
			}
			String declaredSha = stripExtension(file);
			Path imagePath = imagesDir.resolve(file);
			if (!Files.exists(imagePath)) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": image file '" + file
								+ "' not found in " + imagesDir);
			}
			byte[] bytes;
			try {
				bytes = Files.readAllBytes(imagePath);
			}
			catch (IOException e) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": cannot read image file '"
								+ file + "'", e);
			}
			String actualSha = sha256Hex(bytes);
			if (!declaredSha.equals(actualSha)) {
				throw new CatalogValidationException(
						"product " + product.getSlug() + ": image file '" + file
								+ "' SHA-256 mismatch (expected " + declaredSha
								+ ", got " + actualSha + ")");
			}
			String contentType = EXT_TO_CONTENT_TYPE.get(ext);
			Integer width = color.getImage().getWidth();
			Integer height = color.getImage().getHeight();
			if (imagesBySha.putIfAbsent(actualSha, bytes) != null) {
				if (!contentTypeBySha.get(actualSha).equals(contentType)) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": color '" + color.getCode()
									+ "' shares image '" + actualSha
									+ "' but declares a different extension (was "
									+ contentTypeBySha.get(actualSha) + ", now " + contentType + ")");
				}
				if (!widthBySha.get(actualSha).equals(width)) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": color '" + color.getCode()
									+ "' shares image '" + actualSha
									+ "' but declares a different width (was "
									+ widthBySha.get(actualSha) + ", now " + width + ")");
				}
				if (!heightBySha.get(actualSha).equals(height)) {
					throw new CatalogValidationException(
							"product " + product.getSlug() + ": color '" + color.getCode()
									+ "' shares image '" + actualSha
									+ "' but declares a different height (was "
									+ heightBySha.get(actualSha) + ", now " + height + ")");
				}
			}
			else {
				contentTypeBySha.put(actualSha, contentType);
				widthBySha.put(actualSha, width);
				heightBySha.put(actualSha, height);
			}
		}
	}

	static String extensionOf(String file) {
		int dot = file.lastIndexOf('.');
		return dot < 0 ? "" : file.substring(dot + 1);
	}

	static String stripExtension(String file) {
		int dot = file.lastIndexOf('.');
		return dot < 0 ? file : file.substring(0, dot);
	}

	static String sha256Hex(byte[] bytes) {
		return sha256Hex("SHA-256", bytes);
	}

	static String sha256Hex(String algorithm, byte[] bytes) {
		try {
			MessageDigest md = MessageDigest.getInstance(algorithm);
			byte[] digest = md.digest(bytes);
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(algorithm + " not available", e);
		}
	}

	public static class ValidatedCatalog {
		private final List<ProductDto> products;
		private final Map<String, byte[]> imagesBySha;
		private final Map<String, String> contentTypeBySha;
		private final Map<String, Integer> widthBySha;
		private final Map<String, Integer> heightBySha;

		public ValidatedCatalog(List<ProductDto> products,
				Map<String, byte[]> imagesBySha,
				Map<String, String> contentTypeBySha,
				Map<String, Integer> widthBySha,
				Map<String, Integer> heightBySha) {
			this.products = products;
			this.imagesBySha = imagesBySha;
			this.contentTypeBySha = contentTypeBySha;
			this.widthBySha = widthBySha;
			this.heightBySha = heightBySha;
		}

		public List<ProductDto> getProducts() {
			return products;
		}

		public Map<String, byte[]> getImagesBySha() {
			return imagesBySha;
		}

		public Map<String, String> getContentTypeBySha() {
			return contentTypeBySha;
		}

		public Map<String, Integer> getWidthBySha() {
			return widthBySha;
		}

		public Map<String, Integer> getHeightBySha() {
			return heightBySha;
		}
	}
}
