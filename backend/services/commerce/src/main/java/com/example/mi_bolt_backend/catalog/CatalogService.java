package com.example.mi_bolt_backend.catalog;

import java.text.Normalizer;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.ProductSort;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * Read-side service for the catalogue API.
 *
 * <p>One request reads the whole catalogue once (a few hundred rows) through a
 * single fetch-join query on {@link ProductRepository#findAllForCatalogue()},
 * then builds the list entries, applies filters, computes disjunctive facets,
 * sorts, paginates and produces the plain-data records consumed by
 * {@link CatalogModels}. The shape and the reasoning are recorded in
 * docs/decisions/0008.
 *
 * <p>Reads conditionally capture a missing campaign reference price in the same
 * transaction. Domain validation throws {@link DomainException} and the {@code ProblemAdvice} layer turns it
 * into a wire response.
 */
@Service
@Transactional
public class CatalogService {

	/** Per-order-line cap, exposed as {@code maxQuantity} on every list entry and variant. */
	public static final int MAX_PER_LINE = 5;

	/** Path prefix on every {@code Image.src}. Kept here so tests can assert the exact string. */
	public static final String MEDIA_SRC_PREFIX = "/api/v1/media/";

	/**
	 * Maximum number of featured entries on the home page regardless of paging
	 * or sort. The contract states "at most four" and the validator also caps
	 * the number of featured products at four, so this only bites if a future
	 * fixture ever grows.
	 */
	private static final int FEATURED_CAP = 4;

	/** Maximum number of related products on the product detail page. */
	private static final int RELATED_CAP = 4;

	/** Storage sizes the fixture uses; the contract only names these three. */
	private static final List<Integer> STORAGE_VALUES = List.of(128, 256, 512);

	private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

	private final Clock clock;
	private final ProductVariantRepository variants;
	private final ProductRepository productRepository;
	private final SpecGroupRepository specGroupRepository;

	public CatalogService(ProductRepository productRepository, SpecGroupRepository specGroupRepository) {
		this(productRepository, specGroupRepository, Clock.systemUTC(), null);
	}

	@Autowired
	public CatalogService(ProductRepository productRepository, SpecGroupRepository specGroupRepository, Clock clock, ProductVariantRepository variants) {
		this.variants = variants;
		this.clock = clock;
		this.productRepository = productRepository;
		this.specGroupRepository = specGroupRepository;
	}

	/**
	 * Loads every product in the catalogue, then walks the remaining collections
	 * in four more queries inside the same persistence context. Hibernate refuses
	 * to fetch-join more than one {@code List} at a time, so the colours (the
	 * one bag query 1 joins) come back with the products and every other
	 * collection is initialised on the same managed entities afterwards.
	 */
	private List<Product> loadCatalogue() {
		List<Product> products = new ArrayList<>(productRepository.findAllWithColors().stream()
				.filter(product -> !SmokeCanaryBootstrap.PRODUCT_SLUG.equals(product.getSlug()))
				.toList());
		productRepository.fetchHighlights(products);
		productRepository.fetchVariants(products);
		captureReferences(products);
		productRepository.fetchSpecGroups(products);
		specGroupRepository.fetchRows(products);
		return products;
	}

	private void captureReferences(List<Product> products) {
		if (variants != null) {
			for (Product product : products) {
				for (ProductVariant variant : product.getVariants()) {
					PriceResolver.captureReference(variant, variants);
				}
			}
		}
	}

	private Product loadOne(Product p) {
		productRepository.fetchColors(List.of(p));
		productRepository.fetchHighlights(List.of(p));
		productRepository.fetchVariants(List.of(p));
		captureReferences(List.of(p));
		productRepository.fetchSpecGroups(List.of(p));
		specGroupRepository.fetchRows(List.of(p));
		return p;
	}

	public CatalogData.ProductPageData listProducts(String q,
			List<String> brand,
			List<StorageGb> storageGb,
			List<String> color,
			Integer minPrice,
			Integer maxPrice,
			Boolean inStock,
			Boolean is5g,
			Boolean featured,
			ProductSort sort,
			int page,
			int pageSize) {
		return listProducts(q, brand, storageGb, color, minPrice, maxPrice, inStock, is5g, featured, null, sort, page, pageSize);
	}

	public CatalogData.ProductPageData listProducts(String q,
			List<String> brand,
			List<StorageGb> storageGb,
			List<String> color,
			Integer minPrice,
			Integer maxPrice,
			Boolean inStock,
			Boolean is5g,
			Boolean featured,
			Boolean activePromotion,
			ProductSort sort,
			int page,
			int pageSize) {
		if (minPrice != null && minPrice < 0) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"minPrice must not be negative",
					Map.of("minPrice", minPrice));
		}
		if (maxPrice != null && maxPrice < 0) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"maxPrice must not be negative",
					Map.of("maxPrice", maxPrice));
		}
		if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"minPrice must not exceed maxPrice",
					Map.of("minPrice", minPrice, "maxPrice", maxPrice));
		}
		if (page < 1) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"page must be at least 1",
					Map.of("page", page));
		}
		int pageSizeValue = parsePageSize(pageSize);

		Filters filters = new Filters(
				normaliseQ(q),
				brand == null ? List.of() : brand,
				storageGb == null ? Set.of() : toStorageSet(storageGb),
				color == null ? Set.of() : Set.copyOf(color),
				minPrice,
				maxPrice,
				inStock,
				is5g,
				featured);

		List<Product> products = loadCatalogue();
		products.sort(RECOMMENDED_PRODUCT_ORDER);

		List<Entry> all = new ArrayList<>();
		for (Product p : products) {
			all.addAll(buildEntriesForProduct(p, Filters.none()));
		}

		filters.activePromotion = activePromotion;
		List<Entry> filtered = filterEntries(all, filters);
		List<Entry> displayed = new ArrayList<>();
		for (Entry e : filtered) {
			Entry picked = pickEntry(e.product, e.storage, filters, null);
			displayed.add(picked == null ? e : picked);
		}
		List<Entry> sorted = sortEntries(displayed, filters, sort);

		List<Entry> capped = applyFeaturedCap(sorted, filters);

		int total = capped.size();
		int totalPages = total == 0 ? 0 : (total + pageSizeValue - 1) / pageSizeValue;

		List<CatalogData.CatalogItemData> items = new ArrayList<>();
		long fromIndex = (long) (page - 1) * pageSizeValue;
		if (fromIndex < total) {
			int from = (int) fromIndex;
			int toIndex = Math.min(from + pageSizeValue, total);
			for (Entry e : capped.subList(from, toIndex)) {
				items.add(toCatalogItemData(e));
			}
		}

		CatalogData.FacetsData facets = computeFacets(all, capped, filters);
		return new CatalogData.ProductPageData(items, total, page, pageSizeValue, totalPages, facets, OffsetDateTime.now(clock),
				products.stream().flatMap(product -> product.getVariants().stream())
						.map(variant -> PriceResolver.resolve(variant, clock).nextPriceChangeAt())
						.filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null));
	}

	public CatalogData.ProductData getProduct(String slug) {
		Product entity = productRepository.findBySlugAndArchivedAtIsNull(slug)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"product not found",
						Map.of("slug", slug)));
		return toProductData(loadOne(entity));
	}

	public List<CatalogData.CatalogItemData> listRelatedProducts(String slug) {
		if (SmokeCanaryBootstrap.PRODUCT_SLUG.equals(slug)) {
			getProduct(slug);
			return List.of();
		}
		List<Product> products = loadCatalogue();
		Product subject = null;
		for (Product p : products) {
			if (p.getSlug().equals(slug)) {
				subject = p;
				break;
			}
		}
		if (subject == null) {
			throw new DomainException(ErrorCode.NOT_FOUND,
					"product not found",
					Map.of("slug", slug));
		}

		List<Product> candidates = new ArrayList<>();
		for (Product p : products) {
			if (p.getId().equals(subject.getId())) {
				continue;
			}
			candidates.add(p);
		}

		List<Product> sameBrand = new ArrayList<>();
		List<Product> sharedStorage = new ArrayList<>();
		Set<Integer> subjectStorages = storagesOf(subject);
		for (Product p : candidates) {
			if (p.getBrand().equals(subject.getBrand())) {
				sameBrand.add(p);
			}
			if (sharesAnyStorage(p, subjectStorages)) {
				sharedStorage.add(p);
			}
		}
		sameBrand.sort(RECOMMENDED_PRODUCT_ORDER);
		sharedStorage.sort(RECOMMENDED_PRODUCT_ORDER);

		List<Product> ordered = new ArrayList<>();
		for (Product p : sameBrand) {
			if (!ordered.contains(p)) {
				ordered.add(p);
			}
		}
		for (Product p : sharedStorage) {
			if (!ordered.contains(p)) {
				ordered.add(p);
			}
		}

		List<CatalogData.CatalogItemData> result = new ArrayList<>();
		for (Product p : ordered) {
			if (result.size() >= RELATED_CAP) {
				break;
			}
			int minStorage = Integer.MAX_VALUE;
			for (ProductVariant v : p.getVariants()) {
				if (v.getStorageGb() != null && v.getStorageGb() < minStorage) {
					minStorage = v.getStorageGb();
				}
			}
			if (minStorage == Integer.MAX_VALUE) {
				continue;
			}
			Entry synthetic = pickEntry(p, minStorage, Filters.none(), null);
			if (synthetic != null) {
				result.add(toCatalogItemData(synthetic));
			}
		}
		return result;
	}

	private List<Entry> buildEntriesForProduct(Product p, Filters filters) {
		List<Entry> out = new ArrayList<>();
		for (int storage : STORAGE_VALUES) {
			Entry e = pickEntry(p, storage, filters, null);
			if (e != null) {
				out.add(e);
			}
		}
		return out;
	}

	/**
	 * Builds the entry for a (product, storage) pair. The displayed colour is
	 * the first colour, in {@code colors} order, that has a variant at this
	 * storage and matches the variant-level colour filter (if any).
	 */
	private Entry pickEntry(Product p, int storage, Filters filters, String colourHint) {
		ColorOptionDisplayed chosen = null;
		List<CatalogData.ColorOptionData> allColors = new ArrayList<>();
		for (ProductColor color : p.getColors()) {
			ProductVariant variant = variantOf(color, storage);
			if (variant == null) {
				continue;
			}
			allColors.add(toColorOptionData(variant, color));
			if (chosen == null) {
				boolean colourAccepted = (colourHint == null || colourHint.equals(color.getCode()))
						&& (filters.color.isEmpty() || filters.color.contains(color.getCode()))
						&& variantMatches(variant, filters);
				if (colourAccepted) {
					chosen = new ColorOptionDisplayed(variant, color);
				}
			}
		}
		if (chosen == null) {
			return null;
		}
		List<String> highlights = p.getHighlights().stream()
				.map(ProductHighlight::getText)
				.toList();
		return new Entry(p, storage, chosen, allColors, highlights);
	}

	private List<Entry> filterEntries(List<Entry> all, Filters filters) {
		List<Entry> kept = new ArrayList<>();
		for (Entry e : all) {
			if (matchesProductLevel(e, filters) && hasMatchingVariant(e, filters)) {
				kept.add(e);
			}
		}
		return kept;
	}

	private boolean matchesProductLevel(Entry e, Filters filters) {
		Product p = e.product;
		if (!filters.brand.isEmpty() && !filters.brand.contains(p.getBrand())) {
			return false;
		}
		if (!filters.storage.isEmpty() && !filters.storage.contains(e.storage)) {
			return false;
		}
		if (filters.is5g != null && p.isIs5g() != filters.is5g.booleanValue()) {
			return false;
		}
		if (filters.featured != null) {
			boolean wantFeatured = filters.featured.booleanValue();
			if (wantFeatured != p.isFeatured()) {
				return false;
			}
		}
		if (filters.q != null) {
			String haystack = searchKey(p);
			if (!haystack.contains(filters.q)) {
				return false;
			}
		}
		return true;
	}

	private boolean hasMatchingVariant(Entry e, Filters filters) {
		for (ProductVariant v : e.product.getVariants()) {
			if (v.getStorageGb() == null || v.getStorageGb() != e.storage) {
				continue;
			}
			if (variantMatches(v, filters)) {
				return true;
			}
		}
		return false;
	}

	private boolean variantMatches(ProductVariant v, Filters filters) {
		if (filters.activePromotion != null && PriceResolver.resolve(v, clock).activePromotion()
				!= filters.activePromotion.booleanValue()) {
			return false;
		}
		if (!filters.color.isEmpty() && !filters.color.contains(v.getColor().getCode())) {
			return false;
		}
		if (filters.minPrice != null && PriceResolver.resolve(v, clock).amount() < filters.minPrice.longValue()) {
			return false;
		}
		if (filters.maxPrice != null && PriceResolver.resolve(v, clock).amount() > filters.maxPrice.longValue()) {
			return false;
		}
		if (filters.inStock != null) {
			boolean want = filters.inStock.booleanValue();
			boolean has = v.getStock() != null && v.getStock() > 0;
			if (want != has) {
				return false;
			}
		}
		return true;
	}

	private List<Entry> sortEntries(List<Entry> entries, Filters filters, ProductSort sort) {
		ProductSort effective = sort == null ? ProductSort.RECOMMENDED : sort;
		List<Entry> copy = new ArrayList<>(entries);
		Comparator<Entry> cmp;
		if (effective == ProductSort.RECOMMENDED && filters.q == null) {
			cmp = RECOMMENDED_ENTRY_ORDER;
		}
		else if (effective == ProductSort.RECOMMENDED) {
			cmp = Comparator.comparingInt((Entry e) -> qPosition(e, filters.q))
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.NEWEST) {
			cmp = Comparator.comparing((Entry e) -> e.product.getReleasedAt()).reversed()
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.OLDEST) {
			cmp = Comparator.comparing((Entry e) -> e.product.getReleasedAt())
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.POPULARITY) {
			cmp = Comparator.comparingInt((Entry e) -> -e.product.getPopularityScore())
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.PRICE_ASC) {
			cmp = Comparator.comparingLong((Entry e) -> PriceResolver.resolve(e.displayed.variant, clock).amount())
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.PRICE_DESC) {
			cmp = Comparator.comparingLong((Entry e) -> -PriceResolver.resolve(e.displayed.variant, clock).amount())
					.thenComparing(RECOMMENDED_ENTRY_ORDER);
		}
		else if (effective == ProductSort.NAME_ASC) {
			cmp = Comparator.comparing((Entry e) ->
							e.product.getBrand() + " " + e.product.getName(),
							String.CASE_INSENSITIVE_ORDER)
					.thenComparingInt((Entry e) -> e.storage);
		}
		else if (effective == ProductSort.NAME_DESC) {
			cmp = Comparator.comparing((Entry e) ->
							e.product.getBrand() + " " + e.product.getName(),
							String.CASE_INSENSITIVE_ORDER)
					.reversed()
					.thenComparingInt((Entry e) -> e.storage);
		}
		else {
			cmp = RECOMMENDED_ENTRY_ORDER;
		}
		copy.sort(cmp);
		return copy;
	}

	private int qPosition(Entry e, String q) {
		String haystack = searchKey(e.product);
		return haystack.indexOf(q);
	}

	private List<Entry> applyFeaturedCap(List<Entry> entries, Filters filters) {
		if (filters.featured == null || !filters.featured.booleanValue()) {
			return entries;
		}
		if (entries.size() <= FEATURED_CAP) {
			return entries;
		}
		return new ArrayList<>(entries.subList(0, FEATURED_CAP));
	}

	private static int capCount(int count, Filters filters) {
		if (filters.featured == null || !filters.featured.booleanValue()) {
			return count;
		}
		return Math.min(count, FEATURED_CAP);
	}

	private CatalogData.FacetsData computeFacets(List<Entry> all, List<Entry> capped, Filters filters) {
		List<CatalogData.FacetValueData> brands = new ArrayList<>();
		List<String> sortedBrands = new ArrayList<>();
		for (Product p : productsInOrder(all)) {
			if (!sortedBrands.contains(p.getBrand())) {
				sortedBrands.add(p.getBrand());
			}
		}
		sortedBrands.sort(String.CASE_INSENSITIVE_ORDER);
		for (String brand : sortedBrands) {
			int count = 0;
			for (Entry e : all) {
				if (!brand.equals(e.product.getBrand())) {
					continue;
				}
				if (matchesBrandFacet(e, filters)) {
					count++;
				}
			}
			brands.add(new CatalogData.FacetValueData(brand, brand, capCount(count, filters)));
		}

		List<CatalogData.FacetValueData> storageFacet = new ArrayList<>();
		Set<Integer> presentStorage = new TreeSet<>();
		for (Entry e : all) {
			presentStorage.add(e.storage);
		}
		for (int storage : STORAGE_VALUES) {
			if (!presentStorage.contains(storage)) {
				continue;
			}
			int count = 0;
			for (Entry e : all) {
				if (e.storage != storage) {
					continue;
				}
				if (matchesStorageFacet(e, filters)) {
					count++;
				}
			}
			storageFacet.add(new CatalogData.FacetValueData(
					Integer.toString(storage), storage + " GB", capCount(count, filters)));
		}

		List<CatalogData.ColorFacetValueData> colors = new ArrayList<>();
		List<String> orderedColorCodes = recommendedColorOrder(all);
		for (String code : orderedColorCodes) {
			ProductColor anyColor = findAnyColorWithCode(all, code);
			int count = 0;
			for (Entry e : all) {
				if (entryHasColorAtStorage(e, code) && matchesColorFacet(e, filters, code)) {
					count++;
				}
			}
			colors.add(new CatalogData.ColorFacetValueData(
					code, anyColor.getName(), capCount(count, filters), anyColor.getSwatchHex()));
		}

		int is5gCount = 0;
		for (Entry e : all) {
			if (e.product.isIs5g() && matchesIs5gFacet(e, filters)) {
				is5gCount++;
			}
		}

		int inStockCount = 0;
		Filters withInStock = new Filters(filters.q, filters.brand, filters.storage, filters.color,
				filters.minPrice, filters.maxPrice, Boolean.TRUE, filters.is5g, filters.featured);
		for (Entry e : all) {
			if (matchesProductLevel(e, withInStock) && hasMatchingVariant(e, withInStock)) {
				inStockCount++;
			}
		}

		long minPrice = Long.MAX_VALUE;
		long maxPrice = Long.MIN_VALUE;
		for (Entry e : capped) {
			long price = PriceResolver.resolve(e.displayed.variant, clock).amount();
			if (price < minPrice) {
				minPrice = price;
			}
			if (price > maxPrice) {
				maxPrice = price;
			}
		}
		if (capped.isEmpty()) {
			minPrice = 0;
			maxPrice = 0;
		}
		CatalogData.PriceRangeData priceRange = new CatalogData.PriceRangeData((int) minPrice, (int) maxPrice);

		return new CatalogData.FacetsData(brands, storageFacet, colors,
				capCount(is5gCount, filters),
				capCount(inStockCount, filters),
				priceRange);
	}

	private boolean matchesBrandFacet(Entry e, Filters filters) {
		if (!filters.storage.isEmpty() && !filters.storage.contains(e.storage)) {
			return false;
		}
		if (filters.is5g != null && e.product.isIs5g() != filters.is5g.booleanValue()) {
			return false;
		}
		if (filters.featured != null && e.product.isFeatured() != filters.featured.booleanValue()) {
			return false;
		}
		if (filters.q != null) {
			String haystack = searchKey(e.product);
			if (!haystack.contains(filters.q)) {
				return false;
			}
		}
		return hasMatchingVariantExcept(e, filters, "brand", null);
	}

	private boolean matchesStorageFacet(Entry e, Filters filters) {
		if (!filters.brand.isEmpty() && !filters.brand.contains(e.product.getBrand())) {
			return false;
		}
		if (filters.is5g != null && e.product.isIs5g() != filters.is5g.booleanValue()) {
			return false;
		}
		if (filters.featured != null && e.product.isFeatured() != filters.featured.booleanValue()) {
			return false;
		}
		if (filters.q != null) {
			String haystack = searchKey(e.product);
			if (!haystack.contains(filters.q)) {
				return false;
			}
		}
		return hasMatchingVariantExcept(e, filters, "storage", null);
	}

	private boolean matchesColorFacet(Entry e, Filters filters, String colourCode) {
		if (!filters.brand.isEmpty() && !filters.brand.contains(e.product.getBrand())) {
			return false;
		}
		if (!filters.storage.isEmpty() && !filters.storage.contains(e.storage)) {
			return false;
		}
		if (filters.is5g != null && e.product.isIs5g() != filters.is5g.booleanValue()) {
			return false;
		}
		if (filters.featured != null && e.product.isFeatured() != filters.featured.booleanValue()) {
			return false;
		}
		if (filters.q != null) {
			String haystack = searchKey(e.product);
			if (!haystack.contains(filters.q)) {
				return false;
			}
		}
		return hasMatchingVariantExcept(e, filters, "color", colourCode);
	}

	private boolean matchesIs5gFacet(Entry e, Filters filters) {
		if (!filters.brand.isEmpty() && !filters.brand.contains(e.product.getBrand())) {
			return false;
		}
		if (!filters.storage.isEmpty() && !filters.storage.contains(e.storage)) {
			return false;
		}
		if (filters.featured != null && e.product.isFeatured() != filters.featured.booleanValue()) {
			return false;
		}
		if (filters.q != null) {
			String haystack = searchKey(e.product);
			if (!haystack.contains(filters.q)) {
				return false;
			}
		}
		return hasMatchingVariantExcept(e, filters, "is5g", null);
	}

	private boolean hasMatchingVariantExcept(Entry e, Filters filters, String facetToIgnore, String colorHint) {
		Filters f = filters.without(facetToIgnore);
		if (colorHint != null) {
			for (ProductVariant v : e.product.getVariants()) {
				if (v.getStorageGb() == null || v.getStorageGb() != e.storage) {
					continue;
				}
				if (!v.getColor().getCode().equals(colorHint)) {
					continue;
				}
				if (variantMatches(v, f)) {
					return true;
				}
			}
			return false;
		}
		return hasMatchingVariant(e, f);
	}

	private boolean entryHasColorAtStorage(Entry e, String colorCode) {
		for (ProductVariant v : e.product.getVariants()) {
			if (v.getStorageGb() != null && v.getStorageGb() == e.storage
					&& v.getColor().getCode().equals(colorCode)) {
				return true;
			}
		}
		return false;
	}

	private ProductColor findAnyColorWithCode(List<Entry> all, String code) {
		for (Entry e : all) {
			for (ProductColor c : e.product.getColors()) {
				if (c.getCode().equals(code)) {
					return c;
				}
			}
		}
		throw new IllegalStateException("color code " + code + " not present in catalogue");
	}

	private List<String> recommendedColorOrder(List<Entry> all) {
		List<Product> ordered = productsInOrder(all);
		Set<String> seen = new TreeSet<>();
		List<String> result = new ArrayList<>();
		for (Product p : ordered) {
			for (ProductColor c : p.getColors()) {
				if (seen.add(c.getCode())) {
					result.add(c.getCode());
				}
			}
		}
		return result;
	}

	private List<Product> productsInOrder(List<Entry> all) {
		Map<Long, Product> byId = new LinkedHashMap<>();
		for (Entry e : all) {
			byId.putIfAbsent(e.product.getId(), e.product);
		}
		List<Product> list = new ArrayList<>(byId.values());
		list.sort(RECOMMENDED_PRODUCT_ORDER);
		return list;
	}

	private ProductVariant variantOf(ProductColor color, int storage) {
		for (ProductVariant v : color.getProduct().getVariants()) {
			if (v.getStorageGb() != null && v.getStorageGb() == storage
					&& v.getColor().getCode().equals(color.getCode())) {
				return v;
			}
		}
		return null;
	}

	private Set<Integer> storagesOf(Product p) {
		Set<Integer> out = new TreeSet<>();
		for (ProductVariant v : p.getVariants()) {
			if (v.getStorageGb() != null) {
				out.add(v.getStorageGb());
			}
		}
		return out;
	}

	private boolean sharesAnyStorage(Product p, Set<Integer> other) {
		for (ProductVariant v : p.getVariants()) {
			if (v.getStorageGb() != null && other.contains(v.getStorageGb())) {
				return true;
			}
		}
		return false;
	}

	private CatalogData.ColorOptionData toColorOptionData(ProductVariant v, ProductColor color) {
		return new CatalogData.ColorOptionData(
				color.getCode(),
				color.getName(),
				color.getSwatchHex(),
				v.getId(),
				v.getSlug(),
				(int) PriceResolver.resolve(v, clock).amount(),
				v.getStock() != null && v.getStock() > 0, toImageData(color), PriceResolver.resolve(v, clock));
	}

	public static CatalogData.ImageData toImageData(ProductColor color) {
		CatalogImage img = color.getImage();
		return new CatalogData.ImageData(
				img.getId(),
				MEDIA_SRC_PREFIX + img.getId(),
				color.getAlt(),
				img.getWidth(),
				img.getHeight());
	}

	private CatalogData.CatalogItemData toCatalogItemData(Entry e) {
		Product p = e.product;
		return new CatalogData.CatalogItemData(
				p.getId().toString(),
				p.getSlug(),
				p.getBrand(),
				p.getName(),
				new ArrayList<>(e.highlights),
				p.isIs5g(),
				p.getReleasedAt(),
				e.storage,
				e.displayed.variant.getId(),
				e.displayed.variant.getSlug(),
				(int) PriceResolver.resolve(e.displayed.variant, clock).amount(),
				e.displayed.variant.getStock() != null && e.displayed.variant.getStock() > 0,
				maxQuantity(e.displayed.variant.getStock()),
				toImageData(e.displayed.color),
				new ArrayList<>(e.colors), PriceResolver.resolve(e.displayed.variant, clock));
	}

	private CatalogData.ProductData toProductData(Product entity) {
		List<CatalogData.VariantData> variants = new ArrayList<>();
		for (ProductVariant v : entity.getVariants()) {
			variants.add(new CatalogData.VariantData(
					v.getId(),
					v.getSlug(),
					v.getColor().getCode(),
					v.getColor().getName(),
					v.getColor().getSwatchHex(),
					v.getStorageGb(),
					(int) PriceResolver.resolve(v, clock).amount(),
					v.getStock() != null && v.getStock() > 0,
					maxQuantity(v.getStock()),
					toImageData(v.getColor()), PriceResolver.resolve(v, clock)));
		}

		List<CatalogData.SpecGroupData> groups = new ArrayList<>();
		Map<String, Integer> slugCount = new LinkedHashMap<>();
		for (SpecGroup g : entity.getSpecGroups()) {
			String baseSlug = slugify(g.getTitle());
			int count = slugCount.getOrDefault(baseSlug, 0);
			String id = count == 0 ? baseSlug : baseSlug + "-" + g.getPosition();
			slugCount.put(baseSlug, count + 1);

			List<CatalogData.SpecRowData> rows = new ArrayList<>();
			for (SpecRow r : g.getRows()) {
				rows.add(new CatalogData.SpecRowData(r.getLabel(), r.getRowValue()));
			}
			groups.add(new CatalogData.SpecGroupData(id, g.getTitle(), rows));
		}

		List<String> highlights = entity.getHighlights().stream()
				.map(ProductHighlight::getText)
				.toList();

		return new CatalogData.ProductData(
				entity.getId().toString(),
				entity.getSlug(),
				entity.getBrand(),
				entity.getName(),
				new ArrayList<>(highlights),
				entity.isIs5g(),
				entity.getReleasedAt(),
				entity.getDescription(),
				variants,
				groups);
	}

	public static int maxQuantity(Integer stock) {
		if (stock == null || stock <= 0) {
			return 0;
		}
		return Math.min(stock, MAX_PER_LINE);
	}

	/**
	 * Orderable quantity cap: 0 for a variant of an archived product,
	 * otherwise {@link #maxQuantity(Integer)} on the variant's stock.
	 */
	public static int orderableMax(ProductVariant variant) {
		return variant.getProduct().getArchivedAt() != null ? 0 : maxQuantity(variant.getStock());
	}

	private static String normaliseQ(String q) {
		if (q == null) {
			return null;
		}
		String trimmed = q.trim();
		if (trimmed.isEmpty()) {
			return null;
		}
		return Normalizer.normalize(trimmed, Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
	}

	private static String searchKey(Product p) {
		return Normalizer.normalize(p.getBrand() + " " + p.getName(), Normalizer.Form.NFC)
				.toLowerCase(Locale.ROOT);
	}

	private static Set<Integer> toStorageSet(List<StorageGb> storageGb) {
		Set<Integer> out = new TreeSet<>();
		for (StorageGb s : storageGb) {
			out.add(s.getValue());
		}
		return out;
	}

	private static int parsePageSize(int pageSize) {
		if (pageSize == 12 || pageSize == 24) {
			return pageSize;
		}
		throw new DomainException(ErrorCode.INVALID_REQUEST,
				"pageSize must be 12 or 24",
				Map.of("pageSize", pageSize));
	}

	/**
	 * Slugifies a spec group title using the same rule as product slugs
	 * (lowercase ASCII alphanumerics joined by dashes), so a title like
	 * "Kijelző" becomes "kijelzo" and a globals like "Akku/Processzor" becomes
	 * "akku-processzor". Combined marks are stripped before slugifying.
	 */
	static String slugify(String title) {
		String trimmed = title == null ? "" : title.trim();
		String nfd = Normalizer.normalize(trimmed, Normalizer.Form.NFD)
				.replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
		String lower = nfd.toLowerCase(Locale.ROOT);
		String replaced = NON_SLUG.matcher(lower).replaceAll("-");
		StringBuilder out = new StringBuilder();
		boolean lastWasDash = true;
		for (int i = 0; i < replaced.length(); i++) {
			char c = replaced.charAt(i);
			if (c == '-') {
				if (!lastWasDash) {
					out.append('-');
					lastWasDash = true;
				}
			}
			else {
				out.append(c);
				lastWasDash = false;
			}
		}
		if (out.length() > 0 && out.charAt(out.length() - 1) == '-') {
			out.setLength(out.length() - 1);
		}
		return out.toString();
	}

	private static final Comparator<Product> RECOMMENDED_PRODUCT_ORDER =
			Comparator.comparingInt(Product::getRank)
					.thenComparing(Product::getId);

	private static final Comparator<Entry> RECOMMENDED_ENTRY_ORDER =
			Comparator.comparingInt((Entry e) -> e.product.getRank())
					.thenComparingLong(e -> e.product.getId())
					.thenComparingInt(e -> e.storage);

	/** Immutable bundle of decoded query-string filters, owned by one request. */
	private static final class Filters {
		final String q;
		final List<String> brand;
		final Set<Integer> storage;
		final Set<String> color;
		final Integer minPrice;
		final Integer maxPrice;
		final Boolean inStock;
		final Boolean is5g;
		final Boolean featured;
		Boolean activePromotion;

		Filters(String q, List<String> brand, Set<Integer> storage, Set<String> color,
				Integer minPrice, Integer maxPrice, Boolean inStock, Boolean is5g, Boolean featured) {
			this.q = q;
			this.brand = brand;
			this.storage = storage;
			this.color = color;
			this.minPrice = minPrice;
			this.maxPrice = maxPrice;
			this.inStock = inStock;
			this.is5g = is5g;
			this.featured = featured;
		}

		static Filters none() {
			return new Filters(null, List.of(), Set.of(), Set.of(), null, null, null, null, null);
		}

		Filters without(String facetToIgnore) {
			Filters relaxed = switch (facetToIgnore) {
				case "brand" -> new Filters(q, List.of(), storage, color, minPrice, maxPrice, inStock, is5g, featured);
				case "storage" -> new Filters(q, brand, Set.of(), color, minPrice, maxPrice, inStock, is5g, featured);
				case "color" -> new Filters(q, brand, storage, Set.of(), minPrice, maxPrice, inStock, is5g, featured);
				case "is5g" -> new Filters(q, brand, storage, color, minPrice, maxPrice, inStock, null, featured);
				case "inStock" -> new Filters(q, brand, storage, color, minPrice, maxPrice, null, is5g, featured);
				default -> this;
			};
			relaxed.activePromotion = activePromotion;
			return relaxed;
		}
	}

	private static final class Entry {
		final Product product;
		final int storage;
		final ColorOptionDisplayed displayed;
		final List<CatalogData.ColorOptionData> colors;
		final List<String> highlights;

		Entry(Product product, int storage, ColorOptionDisplayed displayed,
				List<CatalogData.ColorOptionData> colors, List<String> highlights) {
			this.product = product;
			this.storage = storage;
			this.displayed = displayed;
			this.colors = colors;
			this.highlights = highlights;
		}
	}

	private static final class ColorOptionDisplayed {
		final ProductVariant variant;
		final ProductColor color;

		ColorOptionDisplayed(ProductVariant variant, ProductColor color) {
			this.variant = variant;
			this.color = color;
		}
	}
}
