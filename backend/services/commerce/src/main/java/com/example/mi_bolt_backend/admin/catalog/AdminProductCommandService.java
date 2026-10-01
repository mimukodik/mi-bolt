package com.example.mi_bolt_backend.admin.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.AdminProductColorInput;
import com.example.mi_bolt_backend.api.model.AdminProductInput;
import com.example.mi_bolt_backend.api.model.AdminProductVariantInput;
import com.example.mi_bolt_backend.api.model.AdminSpecGroup;
import com.example.mi_bolt_backend.api.model.AdminSpecRow;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.CartItemRepository;
import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.CatalogImageRepository;
import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductColor;
import com.example.mi_bolt_backend.catalog.ProductHighlight;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.SpecGroup;
import com.example.mi_bolt_backend.catalog.SpecRow;
import com.example.mi_bolt_backend.catalog.SmokeCanaryBootstrap;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * The AdminProducts writes: create, replace, archive and restore. Every write sets
 * updated_at from the clock, so the product's version rises exactly once
 * (docs/decisions/0020).
 */
@Service
public class AdminProductCommandService {

	/** At most four active products are featured (contract: AdminProductInput.featured). */
	static final int FEATURED_LIMIT = 4;
	private static final String CANARY_REFUSAL =
			"The smoke canary is reserved and cannot be changed through the admin API";

	private final AdminProductRepository adminProductRepository;
	private final CatalogImageRepository catalogImageRepository;
	private final AdminProductValidator adminProductValidator;
	private final Clock clock;
	private final CartItemRepository cartItemRepository;

	public AdminProductCommandService(AdminProductRepository adminProductRepository,
			CatalogImageRepository catalogImageRepository,
			AdminProductValidator adminProductValidator,
			Clock clock,
			CartItemRepository cartItemRepository) {
		this.adminProductRepository = adminProductRepository;
		this.catalogImageRepository = catalogImageRepository;
		this.adminProductValidator = adminProductValidator;
		this.clock = clock;
		this.cartItemRepository = cartItemRepository;
	}

	/**
	 * Free-text members are stored stripped of leading and trailing whitespace ({@code String.strip}).
	 */
	@Transactional
	public long create(AdminProductInput input) {
		if (SmokeCanaryBootstrap.PRODUCT_SLUG.equals(input.getSlug())) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, CANARY_REFUSAL,
					null, List.of(new FieldError("/slug", "SLUG_TAKEN")), null);
		}
		List<FieldError> invalid = adminProductValidator.validate(input);
		if (!invalid.isEmpty()) {
			throw bodyViolations(invalid);
		}

		List<FieldError> rejected = new ArrayList<>();
		if (adminProductRepository.existsBySlug(input.getSlug())) {
			rejected.add(new FieldError("/slug", "SLUG_TAKEN"));
		}

		Map<String, CatalogImage> images = resolveImages(input.getColors(), rejected);

		if (Boolean.TRUE.equals(input.getFeatured()) && featuredLimitReached()) {
			rejected.add(new FieldError("/featured", "FEATURED_LIMIT").putParamsItem("max", FEATURED_LIMIT));
		}

		if (!rejected.isEmpty()) {
			throw bodyViolations(rejected);
		}

		Product product = toProduct(input, images);
		product.setUpdatedAt(OffsetDateTime.now(clock));
		try {
			return adminProductRepository.saveAndFlush(product).getId();
		}
		catch (DataIntegrityViolationException ex) {
			// A concurrent create of the same slug passes existsBySlug and loses at the unique constraint.
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "One or more supplied fields are not acceptable",
					null, List.of(new FieldError("/slug", "SLUG_TAKEN")), ex);
		}
	}

	/**
	 * Replaces every editable member (docs/decisions/0020, "Replace"). Colours are matched by code
	 * and variants by (colour code, storage). Dropped variants are deleted and flushed before any
	 * other change, so their colours can go and the product row is written once, raising the
	 * version once. A dropped variant an unexpired cart holds answers 409 VARIANT_IN_CART; lines of
	 * expired carts that hold one are deleted first.
	 */
	@Transactional
	public void replace(long productId, String ifMatch, AdminProductInput input) {
		Product product = find(productId);
		AdminProductEtags.expectVersion(product, ifMatch);
		long received = product.getVersion();

		List<FieldError> invalid = adminProductValidator.validate(input);
		if (!invalid.isEmpty()) {
			throw bodyViolations(invalid);
		}

		List<FieldError> rejected = new ArrayList<>();
		if (!product.getSlug().equals(input.getSlug())) {
			rejected.add(new FieldError("/slug", "SLUG_IMMUTABLE"));
		}
		Map<String, CatalogImage> images = resolveImages(input.getColors(), rejected);
		boolean addsFeatured = Boolean.TRUE.equals(input.getFeatured()) && !product.isFeatured()
				&& product.getArchivedAt() == null;
		if (addsFeatured && featuredLimitReached()) {
			rejected.add(new FieldError("/featured", "FEATURED_LIMIT").putParamsItem("max", FEATURED_LIMIT));
		}
		if (!rejected.isEmpty()) {
			throw bodyViolations(rejected);
		}

		List<String> dropped = droppedVariantIds(product, input);
		OffsetDateTime now = OffsetDateTime.now(clock);
		if (!dropped.isEmpty()) {
			List<String> held = cartItemRepository.findVariantIdsInLiveCarts(dropped, now).stream().sorted().toList();
			if (!held.isEmpty()) {
				throw new DomainException(ErrorCode.VARIANT_IN_CART, "A dropped variant is held by an unexpired cart",
						Map.of("variantIds", held));
			}
		}

		try {
			if (!dropped.isEmpty()) {
				cartItemRepository.deleteLinesInExpiredCarts(dropped, now);
			}
			dropVariants(product, dropped);
			adminProductRepository.flush();
			applyReplace(product, input, images);
			product.setUpdatedAt(now);
			adminProductRepository.saveAndFlush(product);
		}
		catch (ObjectOptimisticLockingFailureException ex) {
			// A concurrent write committed after the If-Match check; its version is not known here.
			throw new DomainException(ErrorCode.PRODUCT_VERSION_CONFLICT, "Product version conflict",
					Map.of("received", received), null, ex);
		}
		catch (DataIntegrityViolationException ex) {
			// For example two variant slugs swapped in one replace: the unique constraint is checked per statement.
			throw new DomainException(ErrorCode.CATALOG_CONSTRAINT_CONFLICT, "Catalogue constraint conflict",
					null, null, ex);
		}
	}

	private static List<String> droppedVariantIds(Product product, AdminProductInput input) {
		Set<String> keys = new HashSet<>();
		List<AdminProductVariantInput> variants = input.getVariants();
		if (variants != null) {
			for (AdminProductVariantInput v : variants) {
				if (v == null) {
					continue;
				}
				keys.add(v.getColorCode() + "--" + v.getStorageGb().getValue());
			}
		}
		List<String> dropped = new ArrayList<>();
		for (ProductVariant v : product.getVariants()) {
			if (!keys.contains(v.getColor().getCode() + "--" + v.getStorageGb())) {
				dropped.add(v.getId());
			}
		}
		Collections.sort(dropped);
		return dropped;
	}

	private static void dropVariants(Product product, List<String> dropped) {
		product.getVariants().removeIf(v -> dropped.contains(v.getId()));
	}

	private static void applyReplace(Product product, AdminProductInput input, Map<String, CatalogImage> images) {
		product.setBrand(strip(input.getBrand()));
		product.setName(strip(input.getName()));
		product.setDescription(strip(input.getDescription()));
		product.setIs5g(Boolean.TRUE.equals(input.getIs5g()));
		product.setReleasedAt(input.getReleasedAt());
		product.setRank(input.getRank());
		product.setPopularityScore(input.getPopularityScore());
		product.setFeatured(Boolean.TRUE.equals(input.getFeatured()));

		Map<String, ProductColor> currentColors = new HashMap<>();
		for (ProductColor c : product.getColors()) {
			currentColors.put(c.getCode(), c);
		}
		Map<String, ProductColor> colorByCode = new HashMap<>();
		List<AdminProductColorInput> colors = input.getColors();
		if (colors != null) {
			for (int i = 0; i < colors.size(); i++) {
				AdminProductColorInput colorInput = colors.get(i);
				if (colorInput == null) {
					continue;
				}
				ProductColor color = currentColors.remove(colorInput.getCode());
				if (color == null) {
					color = new ProductColor();
					color.setProduct(product);
					product.getColors().add(color);
				}
				applyColor(color, colorInput, images, i);
				colorByCode.put(colorInput.getCode(), color);
			}
		}
		product.getColors().removeAll(currentColors.values());

		Map<String, ProductVariant> currentVariants = new HashMap<>();
		for (ProductVariant v : product.getVariants()) {
			currentVariants.put(v.getColor().getCode() + "--" + v.getStorageGb(), v);
		}
		List<AdminProductVariantInput> variants = input.getVariants();
		if (variants != null) {
			for (AdminProductVariantInput v : variants) {
				if (v == null) {
					continue;
				}
				String colorCode = v.getColorCode();
				Integer storageGb = v.getStorageGb().getValue();
				ProductVariant variant = currentVariants.get(colorCode + "--" + storageGb);
				if (variant != null) {
					variant.setSlug(v.getSlug());
					variant.setPriceHuf(v.getPrice().getAmount());
					variant.setStock(v.getStock());
				}
				else {
					variant = new ProductVariant();
					variant.setId(product.getSlug() + "--" + colorCode + "--" + storageGb);
					variant.setProduct(product);
					variant.setSlug(v.getSlug());
					variant.setColor(colorByCode.get(colorCode));
					variant.setStorageGb(storageGb);
					variant.setPriceHuf(v.getPrice().getAmount());
					variant.setStock(v.getStock());
					product.getVariants().add(variant);
				}
			}
		}

		product.getHighlights().clear();
		addHighlights(product, input.getHighlights());
		product.getSpecGroups().clear();
		addSpecGroups(product, input.getSpecGroups());
	}

	@Transactional
	public void archive(long productId, String ifMatch) {
		Product product = find(productId);
		AdminProductEtags.expectVersion(product, ifMatch);
		if (product.getArchivedAt() != null) {
			return;
		}
		OffsetDateTime now = OffsetDateTime.now(clock);
		product.setArchivedAt(now);
		product.setUpdatedAt(now);
		adminProductRepository.saveAndFlush(product);
	}

	@Transactional
	public void restore(long productId, String ifMatch) {
		Product product = find(productId);
		AdminProductEtags.expectVersion(product, ifMatch);
		if (product.getArchivedAt() == null) {
			return;
		}
		if (product.isFeatured() && featuredLimitReached()) {
			throw new DomainException(ErrorCode.FEATURED_LIMIT, "Featured limit reached");
		}
		product.setArchivedAt(null);
		product.setUpdatedAt(OffsetDateTime.now(clock));
		adminProductRepository.saveAndFlush(product);
	}

	/**
	 * Locks the featured-limit guard row, then counts in a separate statement, which sees what
	 * the previous holder of the lock committed. A write that cannot add a featured, active
	 * product never calls this, so it takes no lock.
	 */
	private boolean featuredLimitReached() {
		adminProductRepository.lockFeaturedLimit();
		return adminProductRepository.countByFeaturedTrueAndArchivedAtIsNull() >= FEATURED_LIMIT;
	}

	private Product find(long productId) {
		Product product = adminProductRepository.findById(productId)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"Product not found",
						Map.of("productId", productId)));
		if (SmokeCanaryBootstrap.PRODUCT_SLUG.equals(product.getSlug())) {
			throw new DomainException(ErrorCode.NOT_FOUND, CANARY_REFUSAL);
		}
		return product;
	}

	/**
	 * Validation errors answered as ProblemAdvice answers bean validation:
	 * 400 when one is REQUIRED, else 422.
	 */
	static DomainException bodyViolations(List<FieldError> errors) {
		boolean missing = errors.stream().anyMatch(error -> "REQUIRED".equals(error.getCode()));
		if (missing) {
			return new DomainException(ErrorCode.INVALID_REQUEST, "Missing required member", null, errors, null);
		}
		return new DomainException(ErrorCode.VALIDATION_FAILED, "One or more supplied fields are not acceptable",
				null, errors, null);
	}

	private static Product toProduct(AdminProductInput input, Map<String, CatalogImage> images) {
		Product product = new Product();
		product.setSlug(input.getSlug());
		product.setBrand(strip(input.getBrand()));
		product.setName(strip(input.getName()));
		product.setDescription(strip(input.getDescription()));
		product.setIs5g(Boolean.TRUE.equals(input.getIs5g()));
		product.setReleasedAt(input.getReleasedAt());
		product.setRank(input.getRank());
		product.setPopularityScore(input.getPopularityScore());
		product.setFeatured(Boolean.TRUE.equals(input.getFeatured()));

		addHighlights(product, input.getHighlights());

		Map<String, ProductColor> colorByCode = new HashMap<>();
		List<AdminProductColorInput> colors = input.getColors();
		if (colors != null) {
			int cpos = 0;
			for (AdminProductColorInput c : colors) {
				if (c == null) {
					continue;
				}
				ProductColor color = new ProductColor();
				color.setProduct(product);
				applyColor(color, c, images, cpos);
				cpos++;
				product.getColors().add(color);
				if (color.getCode() != null) {
					colorByCode.put(color.getCode(), color);
				}
			}
		}

		addSpecGroups(product, input.getSpecGroups());

		List<AdminProductVariantInput> variants = input.getVariants();
		if (variants != null) {
			for (AdminProductVariantInput v : variants) {
				if (v == null) {
					continue;
				}
				ProductVariant variant = new ProductVariant();
				variant.setId(input.getSlug() + "--" + v.getColorCode() + "--" + v.getStorageGb().getValue());
				variant.setProduct(product);
				variant.setSlug(v.getSlug());
				variant.setColor(colorByCode.get(v.getColorCode()));
				variant.setStorageGb(v.getStorageGb().getValue());
				variant.setPriceHuf(v.getPrice().getAmount());
				variant.setStock(v.getStock());
				product.getVariants().add(variant);
			}
		}

		return product;
	}

	private Map<String, CatalogImage> resolveImages(List<AdminProductColorInput> colors, List<FieldError> rejected) {
		Map<String, CatalogImage> images = new HashMap<>();
		if (colors != null) {
			for (int i = 0; i < colors.size(); i++) {
				AdminProductColorInput color = colors.get(i);
				if (color == null || color.getImageId() == null) {
					continue;
				}
				String imageId = color.getImageId();
				CatalogImage image;
				if (images.containsKey(imageId)) {
					image = images.get(imageId);
				}
				else {
					image = catalogImageRepository.findById(imageId).orElse(null);
					images.put(imageId, image);
				}
				if (image == null) {
					rejected.add(new FieldError("/colors/" + i + "/imageId", "UNKNOWN_IMAGE"));
				}
			}
		}
		return images;
	}

	private static void addHighlights(Product product, List<String> highlights) {
		if (highlights != null) {
			int pos = 0;
			for (String text : highlights) {
				ProductHighlight h = new ProductHighlight();
				h.setProduct(product);
				h.setPosition(pos);
				pos++;
				h.setText(strip(text));
				product.getHighlights().add(h);
			}
		}
	}

	private static void addSpecGroups(Product product, List<AdminSpecGroup> specGroups) {
		if (specGroups != null) {
			int spos = 0;
			for (AdminSpecGroup sg : specGroups) {
				if (sg == null) {
					continue;
				}
				SpecGroup group = new SpecGroup();
				group.setProduct(product);
				group.setPosition(spos);
				spos++;
				group.setTitle(strip(sg.getTitle()));
				List<AdminSpecRow> rows = sg.getRows();
				if (rows != null) {
					int rpos = 0;
					for (AdminSpecRow r : rows) {
						if (r == null) {
							continue;
						}
						SpecRow row = new SpecRow();
						row.setSpecGroup(group);
						row.setPosition(rpos);
						rpos++;
						row.setLabel(strip(r.getLabel()));
						row.setRowValue(strip(r.getValue()));
						group.getRows().add(row);
					}
				}
				product.getSpecGroups().add(group);
			}
		}
	}

	private static void applyColor(ProductColor color, AdminProductColorInput input, Map<String, CatalogImage> images,
			int position) {
		color.setCode(input.getCode());
		color.setName(strip(input.getName()));
		color.setSwatchHex(input.getSwatchHex());
		color.setAlt(strip(input.getAlt()));
		CatalogImage image = input.getImageId() == null ? null : images.get(input.getImageId());
		color.setImage(image);
		color.setPosition(position);
	}

	private static String strip(String value) {
		return value == null ? null : value.strip();
	}
}
