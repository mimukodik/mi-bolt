package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.Clock;
import java.time.Instant;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.test.util.ReflectionTestUtils;

import com.example.mi_bolt_backend.api.model.ProductSort;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * Pure unit tests for {@link CatalogService}. The repository is mocked so the
 * tests run without a Spring context. A hand-built catalogue of six products
 * exercises both the featured cap (4) and the related cap (4), disjunctive
 * facet counts with a brand and a colour selected at once, every sort value
 * with a deterministic expected order, {@code q} relevance, the empty-result
 * price-range rule and the {@code maxQuantity} clamping.
 */
class CatalogServiceTest {

	private CatalogService service;
	private static final AtomicLong NEXT_ID = new AtomicLong(1000);

	@BeforeEach
	void setUp() {
		NEXT_ID.set(1000);
		useCatalogue(buildCatalogue());
	}

	private void useCatalogue(List<Product> catalogue) {
		ProductRepository productRepository = mock(ProductRepository.class);
		SpecGroupRepository specGroupRepository = mock(SpecGroupRepository.class);
		service = new CatalogService(productRepository, specGroupRepository,
				Clock.fixed(Instant.parse("2026-10-31T00:00:00Z"), ZoneOffset.UTC), null);
		when(productRepository.findAllWithColors()).thenReturn(catalogue);
		when(productRepository.fetchHighlights(ArgumentMatchers.anyList())).thenReturn(catalogue);
		when(productRepository.fetchVariants(ArgumentMatchers.anyList())).thenReturn(catalogue);
		when(productRepository.fetchSpecGroups(ArgumentMatchers.anyList())).thenReturn(catalogue);
		when(specGroupRepository.fetchRows(ArgumentMatchers.anyList())).thenReturn(List.of());
		when(productRepository.findBySlugAndArchivedAtIsNull(ArgumentMatchers.anyString()))
				.thenAnswer(invocation -> {
					String slug = invocation.getArgument(0);
					for (Product p : catalogue) {
						if (p.getSlug().equals(slug) && p.getArchivedAt() == null) {
							return Optional.of(p);
						}
					}
					return Optional.empty();
				});
	}

	private static List<Product> buildProbePhone() {
		List<Product> out = new ArrayList<>();
		List<ProductColor> colours = List.of(
				color("alpha", "Alpha", "#111111", "Alpha",
						"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8"),
				color("beta", "Beta", "#222222", "Beta",
						"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8"));
		List<ProductVariant> variants = List.of(
				variant("probe-phone--alpha--128", "alpha-128", "alpha", 128, 100000, 0),
				variant("probe-phone--beta--128", "beta-128", "beta", 128, 200000, 5));
		out.add(createProduct("probe-phone", "Probe", "Phone",
				LocalDate.parse("2025-01-01"), 1, 50, false, true,
				List.of("probe highlight"), colours, variants));
		return out;
	}

	@Test
	void activePromotionSelectsDiscountedColourAndEffectivePriceRange() {
		List<Product> products = buildProbePhone();
		Product product = products.getFirst();
		product.setPromotionEnabled(true);
		product.setPromotionText("Halloween");
		product.setPromotionStartsAt(OffsetDateTime.parse("2026-10-30T00:00Z"));
		product.setPromotionEndsAt(OffsetDateTime.parse("2026-11-02T00:00Z"));
		ProductVariant discounted = product.getVariants().get(1);
		discounted.setSalePriceHuf(90_000L);
		useCatalogue(products);
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				80_000, 95_000, null, null, null, true, ProductSort.PRICE_ASC, 1, 12);
		assertThat(page.items()).hasSize(1);
		assertThat(page.items().getFirst().variantId()).isEqualTo(discounted.getId());
		assertThat(page.items().getFirst().priceAmount()).isEqualTo(90_000);
		assertThat(page.items().getFirst().priceMetadata().referencePrice()).isEqualTo(200_000);
		assertThat(page.facets().priceRange().min()).isEqualTo(90_000);
	}

	@Test
	void emptyActiveFilterStillReturnsScheduledBoundary() {
		List<Product> products = buildProbePhone();
		Product product = products.getFirst();
		product.setPromotionEnabled(true);
		product.setPromotionText("Later");
		product.setPromotionStartsAt(OffsetDateTime.parse("2026-11-01T00:00Z"));
		product.setPromotionEndsAt(OffsetDateTime.parse("2026-11-02T00:00Z"));
		product.getVariants().getFirst().setSalePriceHuf(90_000L);
		useCatalogue(products);
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, true, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.items()).isEmpty();
		assertThat(page.serverTime()).isEqualTo(OffsetDateTime.parse("2026-10-31T00:00Z"));
		assertThat(page.nextPriceChangeAt()).isEqualTo(product.getPromotionStartsAt());
	}

	@Test
	void defaultListReturnsTwelveEntriesInRecommendedOrder() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.items()).hasSize(12);
		assertThat(page.total()).isEqualTo(12);
		assertThat(page.totalPages()).isEqualTo(1);
		assertThat(page.page()).isEqualTo(1);
		assertThat(page.pageSize()).isEqualTo(12);
		assertThat(page.facets().priceRange().min()).isEqualTo(12990);
		assertThat(page.facets().priceRange().max()).isEqualTo(449990);
	}

	@Test
	void featuredTrueCapsAtFourEntries() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, true, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.items()).hasSize(4);
		assertThat(page.total()).isEqualTo(4);
	}

	@Test
	void featuredCapClampsEveryFacetCount() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, true, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(4);
		assertThat(page.facets().inStock()).isEqualTo(4);
		assertThat(page.facets().is5g()).isEqualTo(4);
		Map<String, Integer> brands = new HashMap<>();
		for (CatalogData.FacetValueData b : page.facets().brands()) {
			brands.put(b.value(), b.count());
		}
		assertThat(brands.get("Samsung")).isEqualTo(4);
		for (CatalogData.FacetValueData s : page.facets().storageGb()) {
			assertThat(s.count()).isLessThanOrEqualTo(4);
		}
		for (CatalogData.ColorFacetValueData c : page.facets().colors()) {
			assertThat(c.count()).isLessThanOrEqualTo(4);
		}
	}

	@Test
	void maxQuantityClampsToFive() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		Map<String, Integer> maxById = new HashMap<>();
		for (CatalogData.CatalogItemData item : page.items()) {
			maxById.put(item.variantId(), item.maxQuantity());
		}
		assertThat(maxById.get("apple-iphone-16--midnight--128")).isEqualTo(5);
		assertThat(maxById.get("apple-iphone-16--midnight--256")).isEqualTo(5);
		assertThat(maxById.get("nokia-105--black--128")).isEqualTo(0);
		assertThat(maxById.get("samsung-galaxy-s25--navy--128")).isEqualTo(5);
	}

	@Test
	void disjunctiveBrandFacetCountWhenBrandIsSelected() {
		CatalogData.ProductPageData page = service.listProducts(null, List.of("Nokia"), null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(1);
		assertThat(page.facets().brands()).hasSize(4);
		assertThat(page.facets().brands().get(0).value()).isEqualTo("Apple");
		assertThat(page.facets().brands().get(0).count()).isEqualTo(4);
		assertThat(page.facets().brands().get(1).value()).isEqualTo("Google");
		assertThat(page.facets().brands().get(1).count()).isEqualTo(2);
		assertThat(page.facets().brands().get(2).value()).isEqualTo("Nokia");
		assertThat(page.facets().brands().get(2).count()).isEqualTo(1);
		assertThat(page.facets().brands().get(3).value()).isEqualTo("Samsung");
		assertThat(page.facets().brands().get(3).count()).isEqualTo(5);
	}

	@Test
	void disjunctiveColorFacetCountWhenBrandAndColorAreSelected() {
		CatalogData.ProductPageData page = service.listProducts(null,
				List.of("Samsung"), null, List.of("navy"), null, null, null, null, null,
				ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(3);
		Map<String, Integer> counts = new HashMap<>();
		for (CatalogData.ColorFacetValueData c : page.facets().colors()) {
			counts.put(c.value(), c.count());
		}
		assertThat(counts.get("navy")).isEqualTo(3);
		assertThat(page.facets().colors()).hasSize(8);
		assertThat(counts.keySet()).containsExactlyInAnyOrder("navy", "silver", "navy-alt", "midnight", "pink", "hazel", "iceblue", "black");
	}

	@Test
	void qRelevanceOrderAndNfcNormalization() {
		CatalogData.ProductPageData upper = service.listProducts("IPHONE", null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(upper.total()).isEqualTo(4);
		CatalogData.ProductPageData byPosition = service.listProducts("i", null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		List<String> slugs = new ArrayList<>();
		for (CatalogData.CatalogItemData item : byPosition.items()) {
			if (!slugs.contains(item.slug())) {
				slugs.add(item.slug());
			}
		}
		assertThat(slugs).containsExactly("nokia-105", "apple-iphone-16", "apple-iphone-15", "google-pixel-8");
	}

	@Test
	void qEmptyMeansNoFilter() {
		CatalogData.ProductPageData page = service.listProducts("   ", null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(12);
	}

	@Test
	void nfdProductNameMatchesNfcQuery() {
		Product p = createProduct("nfd-phone", "Probe", Normalizer.normalize("Jégkék", Normalizer.Form.NFD),
				LocalDate.parse("2025-01-01"), 1, 50, false, false,
				List.of("h"),
				List.of(color("solo", "Solo", "#123456", "Solo",
						"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8")),
				List.of(variant("nfd-phone--solo--128", "solo-128", "solo", 128, 100000, 5)));
		useCatalogue(new ArrayList<>(List.of(p)));
		CatalogData.ProductPageData page = service.listProducts("jégkék", null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(1);
		assertThat(page.items().get(0).slug()).isEqualTo("nfd-phone");
	}

	@Test
	void sortPriceDescLeadsApple256() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.PRICE_DESC, 1, 12);
		assertThat(page.items().get(0).variantId()).isEqualTo("apple-iphone-16--midnight--256");
	}

	@Test
	void sortPriceAscLeadsNokia() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.PRICE_ASC, 1, 12);
		assertThat(page.items().get(0).slug()).isEqualTo("nokia-105");
	}

	@Test
	void sortNameAscLeadsApple() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.NAME_ASC, 1, 12);
		assertThat(page.items().get(0).brand()).isEqualTo("Apple");
		assertThat(page.items().get(0).storageGb()).isEqualTo(128);
	}

	@Test
	void sortNameDescLeadsSamsung() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.NAME_DESC, 1, 12);
		assertThat(page.items().get(0).brand()).isEqualTo("Samsung");
		assertThat(page.items().get(0).storageGb()).isEqualTo(128);
	}

	@Test
	void sortNewestLeadsSamsung() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.NEWEST, 1, 12);
		assertThat(page.items().get(0).slug()).isEqualTo("samsung-galaxy-s25");
	}

	@Test
	void sortPopularityLeadsApple128() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.POPULARITY, 1, 12);
		assertThat(page.items().get(0).slug()).isEqualTo("apple-iphone-16");
		assertThat(page.items().get(0).storageGb()).isEqualTo(128);
	}

	@Test
	void emptyResultYieldsZeroZeroPriceRange() {
		CatalogData.ProductPageData page = service.listProducts("zzz-nothing-matches", null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isZero();
		assertThat(page.facets().priceRange().min()).isZero();
		assertThat(page.facets().priceRange().max()).isZero();
	}

	@Test
	void minPriceGreaterThanMaxPriceIsInvalidRequest() {
		assertThatThrownBy(() -> service.listProducts(null, null, null, null,
				500000, 100, null, null, null, ProductSort.RECOMMENDED, 1, 12))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.INVALID_REQUEST);
	}

	@Test
	void invalidPageSizeIsInvalidRequest() {
		assertThatThrownBy(() -> service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 13))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.INVALID_REQUEST);
	}

	@Test
	void getProductReturnsCompleteData() {
		CatalogData.ProductData product = service.getProduct("samsung-galaxy-s25");
		assertThat(product.slug()).isEqualTo("samsung-galaxy-s25");
		assertThat(product.variants()).hasSize(7);
		assertThat(product.specGroups()).extracting(CatalogData.SpecGroupData::id)
				.containsExactly("kijelzo", "akkumulator");
	}

	@Test
	void orderableMaxIsZeroForArchivedProductVariant() {
		Product archived = buildCatalogue().stream()
				.filter(p -> "apple-iphone-16".equals(p.getSlug()))
				.findFirst().orElseThrow();
		ReflectionTestUtils.setField(archived, "archivedAt",
				OffsetDateTime.now(ZoneOffset.UTC));
		ProductVariant variant = archived.getVariants().get(0);
		assertThat(CatalogService.orderableMax(variant)).isZero();
	}

	@Test
	void orderableMaxUsesMaxQuantityForActiveProduct() {
		Product active = buildCatalogue().stream()
				.filter(p -> "samsung-galaxy-s25".equals(p.getSlug()))
				.findFirst().orElseThrow();
		ProductVariant stock3 = active.getVariants().stream()
				.filter(v -> v.getStock() != null && v.getStock() == 3)
				.findFirst().orElseThrow();
		assertThat(CatalogService.orderableMax(stock3)).isEqualTo(CatalogService.maxQuantity(3));

		ProductVariant stock12 = createProbeVariantWithStock(active, 12);
		assertThat(CatalogService.orderableMax(stock12)).isEqualTo(CatalogService.maxQuantity(12));
	}

	private ProductVariant createProbeVariantWithStock(Product product, int stock) {
		ProductVariant v = new ProductVariant();
		v.setId("probe--" + product.getSlug() + "--" + stock);
		v.setSlug("probe-" + stock);
		v.setColor(product.getColors().get(0));
		v.setStorageGb(128);
		v.setPriceHuf(100000L);
		v.setStock(stock);
		v.setProduct(product);
		return v;
	}

	@Test
	void getProductUnknownSlugThrowsNotFound() {
		assertThatThrownBy(() -> service.getProduct("nope"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.NOT_FOUND
						&& "nope".equals(((DomainException) ex).params().get("slug")));
	}

	@Test
	void relatedCapsAtFourAndPrefersSameBrand() {
		List<CatalogData.CatalogItemData> related = service.listRelatedProducts("samsung-galaxy-s25");
		assertThat(related).hasSize(4);
		assertThat(related.get(0).brand()).isEqualTo("Samsung");
	}

	@Test
	void priceRangeCoversFeaturedCappedEntries() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, true, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.facets().priceRange().min()).isEqualTo(299990);
		assertThat(page.facets().priceRange().max()).isEqualTo(399990);
	}

	@Test
	void slugifyStripsAccentsAndNormalises() {
		assertThat(CatalogService.slugify("Kijelző")).isEqualTo("kijelzo");
		assertThat(CatalogService.slugify("  Akku/Processzor  ")).isEqualTo("akku-processzor");
		assertThat(CatalogService.slugify("Akkumulátor---")).isEqualTo("akkumulator");
	}

	@Test
	void displayedColourFollowsInStockFilter() {
		useCatalogue(buildProbePhone());
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, Boolean.TRUE, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(1);
		assertThat(page.items()).hasSize(1);
		assertThat(page.items().get(0).variantId()).isEqualTo("probe-phone--beta--128");
		assertThat(page.items().get(0).priceAmount()).isEqualTo(200000);
		assertThat(page.items().get(0).inStock()).isTrue();
		assertThat(page.items().get(0).maxQuantity()).isEqualTo(5);
	}

	@Test
	void displayedColourFollowsMinPriceFilter() {
		useCatalogue(buildProbePhone());
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				150000, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(1);
		assertThat(page.items()).hasSize(1);
		assertThat(page.items().get(0).variantId()).isEqualTo("probe-phone--beta--128");
		assertThat(page.items().get(0).priceAmount()).isEqualTo(200000);
		assertThat(page.facets().priceRange().min()).isEqualTo(200000);
		assertThat(page.facets().priceRange().max()).isEqualTo(200000);
	}

	@Test
	void inStockFacetCountsOnlyEntriesTheFilterWouldKeep() {
		useCatalogue(buildProbePhone());
		CatalogData.ProductPageData pageAlpha = service.listProducts(null, null, null, List.of("alpha"),
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(pageAlpha.facets().inStock()).isZero();
		assertThat(pageAlpha.total()).isEqualTo(1);

		CatalogData.ProductPageData pageAlphaInStock = service.listProducts(null, null, null, List.of("alpha"),
				null, null, Boolean.TRUE, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(pageAlphaInStock.total()).isZero();
	}

	@Test
	void priceRangeFollowsTheSortedFeaturedCap() {
		List<ProductColor> coloursX = List.of(
				color("x", "X", "#333333", "X",
						"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8"));
		List<ProductVariant> variantsX = List.of(
				variant("cap-x--x--128", "x-128", "x", 128, 100000, 5),
				variant("cap-x--x--256", "x-256", "x", 256, 200000, 5),
				variant("cap-x--x--512", "x-512", "x", 512, 300000, 5));
		Product x = createProduct("cap-x", "Cap", "X",
				LocalDate.parse("2025-03-01"), 1, 50, true, false,
				List.of("x highlight"), coloursX, variantsX);

		List<ProductColor> coloursY = List.of(
				color("y", "Y", "#444444", "Y",
						"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8"));
		List<ProductVariant> variantsY = List.of(
				variant("cap-y--y--128", "y-128", "y", 128, 400000, 5),
				variant("cap-y--y--256", "y-256", "y", 256, 500000, 5));
		Product y = createProduct("cap-y", "Cap", "Y",
				LocalDate.parse("2025-03-01"), 2, 50, true, false,
				List.of("y highlight"), coloursY, variantsY);

		useCatalogue(new ArrayList<>(List.of(x, y)));
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, true, ProductSort.PRICE_DESC, 1, 12);
		assertThat(page.items()).extracting(CatalogData.CatalogItemData::priceAmount)
				.containsExactly(500000, 400000, 300000, 200000);
		assertThat(page.facets().priceRange().min()).isEqualTo(200000);
		assertThat(page.facets().priceRange().max()).isEqualTo(500000);
	}

	@Test
	void hugePageReturnsEmptyItems() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, null,
				null, null, null, null, null, ProductSort.RECOMMENDED, 200000000, 12);
		assertThat(page.items()).isEmpty();
		assertThat(page.total()).isEqualTo(12);
		assertThat(page.totalPages()).isEqualTo(1);
		assertThat(page.page()).isEqualTo(200000000);
	}

	@Test
	void colourFilterKeepsEveryBrandStorageAndColourInFacets() {
		CatalogData.ProductPageData page = service.listProducts(null, null, null, List.of("black"),
				null, null, null, null, null, ProductSort.RECOMMENDED, 1, 12);
		assertThat(page.total()).isEqualTo(1);
		assertThat(page.facets().brands()).hasSize(4);
		assertThat(page.facets().brands().get(0).value()).isEqualTo("Apple");
		assertThat(page.facets().brands().get(0).count()).isZero();
		assertThat(page.facets().brands().get(1).value()).isEqualTo("Google");
		assertThat(page.facets().brands().get(1).count()).isZero();
		assertThat(page.facets().brands().get(2).value()).isEqualTo("Nokia");
		assertThat(page.facets().brands().get(2).count()).isEqualTo(1);
		assertThat(page.facets().brands().get(3).value()).isEqualTo("Samsung");
		assertThat(page.facets().brands().get(3).count()).isZero();

		assertThat(page.facets().storageGb()).hasSize(3);
		assertThat(page.facets().storageGb().get(0).value()).isEqualTo("128");
		assertThat(page.facets().storageGb().get(0).count()).isEqualTo(1);
		assertThat(page.facets().storageGb().get(1).value()).isEqualTo("256");
		assertThat(page.facets().storageGb().get(1).count()).isZero();
		assertThat(page.facets().storageGb().get(2).value()).isEqualTo("512");
		assertThat(page.facets().storageGb().get(2).count()).isZero();

		assertThat(page.facets().colors()).extracting(CatalogData.ColorFacetValueData::value)
				.containsExactly("navy", "silver", "navy-alt", "midnight", "pink", "hazel", "iceblue", "black");
		assertThat(page.facets().colors()).filteredOn(c -> "navy".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(3);
		assertThat(page.facets().colors()).filteredOn(c -> "silver".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(3);
		assertThat(page.facets().colors()).filteredOn(c -> "navy-alt".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(1);
		assertThat(page.facets().colors()).filteredOn(c -> "midnight".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(2);
		assertThat(page.facets().colors()).filteredOn(c -> "pink".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(2);
		assertThat(page.facets().colors()).filteredOn(c -> "hazel".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(2);
		assertThat(page.facets().colors()).filteredOn(c -> "iceblue".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(2);
		assertThat(page.facets().colors()).filteredOn(c -> "black".equals(c.value())).extracting(CatalogData.ColorFacetValueData::count).containsExactly(1);
	}

	private List<Product> buildCatalogue() {
		List<Product> out = new ArrayList<>();
		out.add(createProduct("samsung-galaxy-s25", "Samsung", "Galaxy S25",
				LocalDate.parse("2025-02-07"), 12, 87, true, true,
				List.of("6,2\" Dynamic AMOLED 2X"),
				List.of(
						color("navy", "Sötétkék", "#1B2A49", "Samsung Galaxy S25 sötétkék",
								"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8"),
						color("silver", "Ezüst", "#C0C0C0", "Samsung Galaxy S25 ezüst",
								"052fbcc4bbaa16e953edf6427e20fba34bb43601a5282b314177ee89d5b85062"),
						color("navy-alt", "Sötétkék (más nézet)", "#1B2A49", "Samsung Galaxy S25 sötétkék alternatív",
								"0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8")),
				List.of(
						variant("samsung-galaxy-s25--navy--128", "sotetkek-128gb", "navy", 128, 299990, 7),
						variant("samsung-galaxy-s25--navy--256", "sotetkek-256gb", "navy", 256, 349990, 3),
						variant("samsung-galaxy-s25--navy--512", "sotetkek-512gb", "navy", 512, 399990, 5),
						variant("samsung-galaxy-s25--silver--128", "ezust-128gb", "silver", 128, 299990, 6),
						variant("samsung-galaxy-s25--silver--256", "ezust-256gb", "silver", 256, 349990, 4),
						variant("samsung-galaxy-s25--silver--512", "ezust-512gb", "silver", 512, 399990, 2),
						variant("samsung-galaxy-s25--navy-alt--256", "sotetkek-alt-256gb", "navy-alt", 256, 349990, 1))));
		out.add(createProduct("apple-iphone-16", "Apple", "iPhone 16",
				LocalDate.parse("2024-09-20"), 18, 92, false, true,
				List.of("6,1\" Super Retina XDR", "A18 chip"),
				List.of(color("midnight", "Éjfekete", "#14141E", "Apple iPhone 16 éjfekete",
						"071b4f5e6090cfe2a70515bdcf2b72ecc5f21ed6d39ad6dcb9b510e39e24a5a3")),
				List.of(
						variant("apple-iphone-16--midnight--128", "ejszaka-128gb", "midnight", 128, 399990, 8),
						variant("apple-iphone-16--midnight--256", "ejszaka-256gb", "midnight", 256, 449990, 5))));
		out.add(createProduct("nokia-105", "Nokia", "105",
				LocalDate.parse("2023-04-01"), 95, 24, false, false,
				List.of("1,77\" kijelző"),
				List.of(color("black", "Fekete", "#000000", "Nokia 105 fekete",
						"0b460ce112a3af66e939ef080de17c73b1e1b9e25dd91e63814ea3dda5f57e31")),
				List.of(variant("nokia-105--black--128", "fekete-128gb", "black", 128, 12990, 0))));
		out.add(createProduct("samsung-galaxy-a55", "Samsung", "Galaxy A55",
				LocalDate.parse("2024-03-15"), 30, 70, true, false,
				List.of("6,4\" Super AMOLED"),
				List.of(color("iceblue", "Jégkék", "#B0E0E6", "Samsung Galaxy A55 jégkék",
						"052fbcc4bbaa16e953edf6427e20fba34bb43601a5282b314177ee89d5b85062")),
				List.of(
						variant("samsung-galaxy-a55--iceblue--128", "jegkek-128gb", "iceblue", 128, 159990, 4),
						variant("samsung-galaxy-a55--iceblue--256", "jegkek-256gb", "iceblue", 256, 189990, 2))));
		out.add(createProduct("apple-iphone-15", "Apple", "iPhone 15",
				LocalDate.parse("2023-09-22"), 22, 80, true, true,
				List.of("6,1\" Super Retina XDR"),
				List.of(color("pink", "Rózsaszín", "#FFC0CB", "Apple iPhone 15 rózsaszín",
						"071b4f5e6090cfe2a70515bdcf2b72ecc5f21ed6d39ad6dcb9b510e39e24a5a3")),
				List.of(
						variant("apple-iphone-15--pink--128", "rozsaszin-128gb", "pink", 128, 349990, 6),
						variant("apple-iphone-15--pink--256", "rozsaszin-256gb", "pink", 256, 399990, 3))));
		out.add(createProduct("google-pixel-8", "Google", "Pixel 8",
				LocalDate.parse("2023-10-12"), 28, 65, false, true,
				List.of("6,2\" Actua kijelző"),
				List.of(color("hazel", "Mogyoró", "#A88B5C", "Google Pixel 8 mogyoró",
						"071b4f5e6090cfe2a70515bdcf2b72ecc5f21ed6d39ad6dcb9b510e39e24a5a3")),
				List.of(
						variant("google-pixel-8--hazel--128", "mogyoro-128gb", "hazel", 128, 249990, 4),
						variant("google-pixel-8--hazel--256", "mogyoro-256gb", "hazel", 256, 299990, 1))));

		Map<String, ProductColor> colorLookup = new HashMap<>();
		for (Product p : out) {
			for (ProductColor c : p.getColors()) {
				colorLookup.put(p.getSlug() + "--" + c.getCode(), c);
			}
		}
		for (Product p : out) {
			for (ProductVariant v : p.getVariants()) {
				ProductColor matched = colorLookup.get(p.getSlug() + "--" + v.getColor().getCode());
				v.setColor(matched);
			}
		}
		return out;
	}

	private static Product createProduct(String slug, String brand, String name, LocalDate releasedAt,
			int rank, int popularity, boolean featured, boolean is5g,
			List<String> highlights, List<ProductColor> colors, List<ProductVariant> variants) {
		Product p = new Product();
		setId(p, NEXT_ID.incrementAndGet());
		p.setSlug(slug);
		p.setBrand(brand);
		p.setName(name);
		p.setDescription("description for " + slug);
		p.setIs5g(is5g);
		p.setReleasedAt(releasedAt);
		p.setRank(rank);
		p.setPopularityScore(popularity);
		p.setFeatured(featured);
		int pos = 0;
		for (String text : highlights) {
			ProductHighlight h = new ProductHighlight();
			h.setProduct(p);
			h.setPosition(pos);
			pos++;
			h.setText(text);
			p.getHighlights().add(h);
		}
		for (ProductColor c : colors) {
			c.setProduct(p);
			c.setPosition(p.getColors().size());
			p.getColors().add(c);
		}
		for (ProductVariant v : variants) {
			v.setProduct(p);
			p.getVariants().add(v);
		}
		SpecGroup sg = new SpecGroup();
		sg.setProduct(p);
		sg.setPosition(0);
		sg.setTitle("Kijelző");
		SpecRow sr1 = new SpecRow();
		sr1.setSpecGroup(sg);
		sr1.setPosition(0);
		sr1.setLabel("Méret");
		sr1.setRowValue("6,1\"");
		sg.getRows().add(sr1);
		p.getSpecGroups().add(sg);
		if ("samsung-galaxy-s25".equals(slug)) {
			SpecGroup sg2 = new SpecGroup();
			sg2.setProduct(p);
			sg2.setPosition(1);
			sg2.setTitle("Akkumulátor");
			SpecRow sr2 = new SpecRow();
			sr2.setSpecGroup(sg2);
			sr2.setPosition(0);
			sr2.setLabel("Kapacitás");
			sr2.setRowValue("4000 mAh");
			sg2.getRows().add(sr2);
			p.getSpecGroups().add(sg2);
		}
		return p;
	}

	private static ProductColor color(String code, String name, String swatch, String alt, String imageSha) {
		ProductColor c = new ProductColor();
		c.setCode(code);
		c.setName(name);
		c.setSwatchHex(swatch);
		c.setAlt(alt);
		CatalogImage img = new CatalogImage();
		img.setId(imageSha);
		img.setContentType("image/png");
		img.setWidth(300);
		img.setHeight(600);
		img.setBytes(new byte[]{1, 2, 3});
		c.setImage(img);
		c.setPosition(0);
		return c;
	}

	private static ProductVariant variant(String id, String slug, String colorCode, int storage,
			int priceHuf, int stock) {
		ProductVariant v = new ProductVariant();
		v.setId(id);
		v.setSlug(slug);
		v.setColor(new ProductColor());
		v.getColor().setCode(colorCode);
		v.setStorageGb(storage);
		v.setPriceHuf(priceHuf);
		v.setStock(stock);
		return v;
	}

	private static void setId(Product p, long id) {
		ReflectionTestUtils.setField(p, "id", id);
	}
}
