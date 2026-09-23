package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.example.mi_bolt_backend.api.model.AdminProduct;
import com.example.mi_bolt_backend.api.model.AdminProductColor;
import com.example.mi_bolt_backend.api.model.AdminProductListColor;
import com.example.mi_bolt_backend.api.model.AdminProductListItem;
import com.example.mi_bolt_backend.api.model.AdminProductPage;
import com.example.mi_bolt_backend.api.model.AdminProductSortField;
import com.example.mi_bolt_backend.api.model.AdminProductStatus;
import com.example.mi_bolt_backend.api.model.AdminProductStatusFilter;
import com.example.mi_bolt_backend.api.model.AdminProductVariant;
import com.example.mi_bolt_backend.api.model.AdminSpecGroup;
import com.example.mi_bolt_backend.api.model.AdminSpecRow;
import com.example.mi_bolt_backend.api.model.Image;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.SortDirection;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.catalog.CatalogService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Exercises {@link AdminProductQueryService} against the shared 3-product
 * fixture ({@code catalog.json}): Samsung Galaxy S25 (id 1, rank 12,
 * featured), Apple iPhone 16 (id 2, rank 18) and Nokia 105 (id 3, rank 95,
 * its only variant at stock 0), loaded once for every {@code @IntegrationTest}.
 * Every fixture mutation goes through {@link #jdbc} and is undone in
 * {@link #restoreFixture()}; nothing here saves an entity, because an entity
 * save bumps {@code @Version} and a later unit's test pins the fixture
 * products at version 0.
 */
@IntegrationTest
class AdminProductQueryServiceTest {

	private static final long SAMSUNG_ID = 1L;
	private static final long APPLE_ID = 2L;
	private static final long NOKIA_ID = 3L;

	@Autowired
	private AdminProductQueryService service;

	@Autowired
	private JdbcTemplate jdbc;

	@AfterEach
	void restoreFixture() {
		jdbc.update("update product set archived_at = null where id in (?, ?, ?)", SAMSUNG_ID, APPLE_ID, NOKIA_ID);
		jdbc.update("update product set name = ? where id = ?", "105", NOKIA_ID);
	}

	private static AdminProductListQuery query(AdminProductStatusFilter status, String q, List<String> brand,
			Boolean featured, Boolean outOfStock, AdminProductSortField sort, SortDirection direction,
			int page, int pageSize) {
		return new AdminProductListQuery(q, brand, status, featured, outOfStock, sort, direction, page, pageSize);
	}

	private static AdminProductListQuery defaultQuery(AdminProductSortField sort, SortDirection direction,
			int page, int pageSize) {
		return query(AdminProductStatusFilter.ACTIVE, null, null, null, null, sort, direction, page, pageSize);
	}

	// Fails if AdminProductQueryService.java:160 (the RANK case) or the totals
	// at :59-60 (totalElements/totalPages) are removed.
	@Test
	void defaultListIsRankAscendingWithTotals() {
		AdminProductPage page = service.list(
				defaultQuery(AdminProductSortField.RANK, SortDirection.ASC, 1, 50));

		assertThat(page.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25", "apple-iphone-16", "nokia-105");
		assertThat(page.getTotalElements()).isEqualTo(3);
		assertThat(page.getTotalPages()).isEqualTo(1);
		assertThat(page.getPage()).isEqualTo(1);
		assertThat(page.getPageSize()).isEqualTo(50);
	}

	static Stream<Arguments> sortFieldsBothDirections() {
		return Stream.of(
				Arguments.of(AdminProductSortField.RANK, SortDirection.ASC, "samsung-galaxy-s25"),
				Arguments.of(AdminProductSortField.RANK, SortDirection.DESC, "nokia-105"),
				Arguments.of(AdminProductSortField.NAME, SortDirection.ASC, "nokia-105"),
				Arguments.of(AdminProductSortField.NAME, SortDirection.DESC, "apple-iphone-16"),
				Arguments.of(AdminProductSortField.BRAND, SortDirection.ASC, "apple-iphone-16"),
				Arguments.of(AdminProductSortField.BRAND, SortDirection.DESC, "samsung-galaxy-s25"),
				Arguments.of(AdminProductSortField.RELEASED_AT, SortDirection.ASC, "nokia-105"),
				Arguments.of(AdminProductSortField.RELEASED_AT, SortDirection.DESC, "samsung-galaxy-s25"),
				Arguments.of(AdminProductSortField.MIN_PRICE, SortDirection.ASC, "nokia-105"),
				Arguments.of(AdminProductSortField.MIN_PRICE, SortDirection.DESC, "apple-iphone-16"),
				Arguments.of(AdminProductSortField.TOTAL_STOCK, SortDirection.ASC, "nokia-105"),
				Arguments.of(AdminProductSortField.TOTAL_STOCK, SortDirection.DESC, "samsung-galaxy-s25"),
				Arguments.of(AdminProductSortField.FEATURED, SortDirection.ASC, "apple-iphone-16"),
				Arguments.of(AdminProductSortField.FEATURED, SortDirection.DESC, "samsung-galaxy-s25"));
	}

	// Fails if any case in the comparator() switch (AdminProductQueryService.java:158-167),
	// minVariantPrice (:147-156), totalStock (:138-145) or byKey (:177-181) is
	// removed or changed.
	@ParameterizedTest
	@MethodSource("sortFieldsBothDirections")
	void eachSortFieldBothDirections(AdminProductSortField sort, SortDirection direction, String expectedFirstSlug) {
		AdminProductPage page = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, null, sort, direction, 1, 50));

		assertThat(page.getItems()).isNotEmpty();
		assertThat(page.getItems().get(0).getSlug()).isEqualTo(expectedFirstSlug);
	}

	// Fails if matchesQ (AdminProductQueryService.java:112-120), in particular
	// its use of p.getSlug() at :117, is removed.
	@Test
	void qMatchesASlugOnlySubstring() {
		AdminProductPage page = service.list(
				query(AdminProductStatusFilter.ACTIVE, "galaxy-s25", null, null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));

		assertThat(page.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25");
	}

	// Fails if normalizeQ (AdminProductQueryService.java:101-109) is removed.
	@Test
	void qIsTrimmedAndCaseInsensitive() {
		AdminProductPage page = service.list(
				query(AdminProductStatusFilter.ACTIVE, "  GALAXY-S25  ", null, null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));

		assertThat(page.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25");
	}

	// Fails if matchesBrand (AdminProductQueryService.java:122-124) is removed.
	@Test
	void brandFilterIsAnOr() {
		AdminProductPage page = service.list(
				query(AdminProductStatusFilter.ALL, null, List.of("Samsung", "Apple"), null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));

		assertThat(page.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25", "apple-iphone-16");
	}

	// Fails if matchesStatus (AdminProductQueryService.java:93-99) is removed.
	@Test
	void statusFilterSeesArchivedProducts() {
		jdbc.update("update product set archived_at = ? where id = ?",
				OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS), SAMSUNG_ID);

		AdminProductPage active = service.list(
				query(AdminProductStatusFilter.ACTIVE, null, null, null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(active.getItems()).hasSize(2);
		assertThat(active.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("apple-iphone-16", "nokia-105");

		AdminProductPage archived = service.list(
				query(AdminProductStatusFilter.ARCHIVED, null, null, null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(archived.getItems()).hasSize(1);
		assertThat(archived.getItems().get(0).getSlug()).isEqualTo("samsung-galaxy-s25");
		assertThat(archived.getItems().get(0).getStatus()).isEqualTo(AdminProductStatus.ARCHIVED);

		AdminProductPage all = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(all.getItems()).hasSize(3);
	}

	// Fails if matchesFeatured (AdminProductQueryService.java:126-128) is removed.
	@Test
	void featuredFilter() {
		AdminProductPage featured = service.list(
				query(AdminProductStatusFilter.ALL, null, null, true, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(featured.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25");

		AdminProductPage notFeatured = service.list(
				query(AdminProductStatusFilter.ALL, null, null, false, null,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(notFeatured.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("apple-iphone-16", "nokia-105");
	}

	// Fails if matchesOutOfStock (AdminProductQueryService.java:130-136) or
	// totalStock (:138-145) is removed. The fixture already has an all-zero-stock
	// product (Nokia 105, its only variant at stock 0), so no SQL mutation is needed.
	@Test
	void outOfStockFilter() {
		AdminProductPage outOfStock = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, true,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(outOfStock.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("nokia-105");

		AdminProductPage inStock = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, false,
						AdminProductSortField.RANK, SortDirection.ASC, 1, 50));
		assertThat(inStock.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("samsung-galaxy-s25", "apple-iphone-16");
	}

	// Fails if the paging slice (AdminProductQueryService.java:62-70) is removed.
	@Test
	void secondPageOfOne() {
		AdminProductPage page = service.list(
				defaultQuery(AdminProductSortField.RANK, SortDirection.ASC, 2, 1));

		assertThat(page.getItems()).extracting(AdminProductListItem::getSlug)
				.containsExactly("apple-iphone-16");
		assertThat(page.getTotalElements()).isEqualTo(3);
		assertThat(page.getTotalPages()).isEqualTo(3);
	}

	// Fails if the "fromIndex < totalElements" guard (AdminProductQueryService.java:64)
	// is removed.
	@Test
	void pagePastTheEndIsEmptyWithTotals() {
		AdminProductPage page = service.list(
				defaultQuery(AdminProductSortField.RANK, SortDirection.ASC, 4, 1));

		assertThat(page.getItems()).isEmpty();
		assertThat(page.getTotalElements()).isEqualTo(3);
		assertThat(page.getTotalPages()).isEqualTo(3);
	}

	// Fails if the ".thenComparing(Product::getId)" tie-break
	// (AdminProductQueryService.java:168) is removed or reversed.
	@Test
	void tieBreakIsIdAscendingInBothDirections() {
		jdbc.update("update product set name = ? where id = ?", "iPhone 16", NOKIA_ID);

		AdminProductPage asc = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, null,
						AdminProductSortField.NAME, SortDirection.ASC, 1, 50));
		int appleIndexAsc = indexOfSlug(asc, "apple-iphone-16");
		int nokiaIndexAsc = indexOfSlug(asc, "nokia-105");
		assertThat(appleIndexAsc).isLessThan(nokiaIndexAsc);

		AdminProductPage desc = service.list(
				query(AdminProductStatusFilter.ALL, null, null, null, null,
						AdminProductSortField.NAME, SortDirection.DESC, 1, 50));
		int appleIndexDesc = indexOfSlug(desc, "apple-iphone-16");
		int nokiaIndexDesc = indexOfSlug(desc, "nokia-105");
		assertThat(appleIndexDesc).isLessThan(nokiaIndexDesc);
	}

	private static int indexOfSlug(AdminProductPage page, String slug) {
		for (int i = 0; i < page.getItems().size(); i++) {
			if (page.getItems().get(i).getSlug().equals(slug)) {
				return i;
			}
		}
		throw new AssertionError("slug not found: " + slug);
	}

	// Fails if AdminProductModels.toListItem (AdminProductModels.java:36-73) is removed.
	@Test
	void listItemCarriesPricesStockColorsAndThumbnail() {
		AdminProductPage page = service.list(
				defaultQuery(AdminProductSortField.RANK, SortDirection.ASC, 1, 50));

		AdminProductListItem samsung = page.getItems().get(0);

		String imageId = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";
		AdminProductListItem expected = new AdminProductListItem(
				SAMSUNG_ID,
				0L,
				"samsung-galaxy-s25",
				"Samsung",
				"Galaxy S25",
				AdminProductStatus.ACTIVE,
				true,
				12,
				LocalDate.of(2025, 2, 7),
				new Money(299_990, Money.CurrencyEnum.HUF),
				new Money(399_990, Money.CurrencyEnum.HUF),
				28,
				7,
				new Image(imageId, CatalogService.MEDIA_SRC_PREFIX + imageId,
						"Samsung Galaxy S25 sötétkék", 300, 600),
				List.of(
						new AdminProductListColor("Sötétkék", "#1B2A49"),
						new AdminProductListColor("Ezüst", "#C0C0C0"),
						new AdminProductListColor("Sötétkék (más nézet)", "#1B2A49")));

		assertThat(samsung).isEqualTo(expected);
	}

	// Fails if AdminProductModels.toDetail (AdminProductModels.java:75-130) is removed.
	@Test
	void detailCarriesEveryMember() {
		AdminProduct actual = service.detail(APPLE_ID);

		String imageId = "071b4f5e6090cfe2a70515bdcf2b72ecc5f21ed6d39ad6dcb9b510e39e24a5a3";
		AdminProduct expected = new AdminProduct(
				APPLE_ID,
				"apple-iphone-16",
				"Apple",
				"iPhone 16",
				"Az Apple iPhone 16 a 2024-es iPhone generáció alapmodellje.",
				true,
				LocalDate.of(2024, 9, 20),
				18,
				92,
				false,
				AdminProductStatus.ACTIVE,
				0L,
				List.of("6,1\" Super Retina XDR", "A18 chip", "48 MP Fusion kamera"),
				List.of(new AdminProductColor("midnight", "Éjfekete", "#14141E",
						new Image(imageId, CatalogService.MEDIA_SRC_PREFIX + imageId,
								"Apple iPhone 16 éjfekete", 300, 600))),
				List.of(
						new AdminProductVariant("apple-iphone-16--midnight--128", "ejszaka-128gb", "midnight",
								StorageGb.NUMBER_128, new Money(399_990, Money.CurrencyEnum.HUF), 8),
						new AdminProductVariant("apple-iphone-16--midnight--256", "ejszaka-256gb", "midnight",
								StorageGb.NUMBER_256, new Money(449_990, Money.CurrencyEnum.HUF), 5)),
				List.of(
						new AdminSpecGroup("Kijelző", List.of(
								new AdminSpecRow("Méret", "6,1\""),
								new AdminSpecRow("Felbontás", "2556×1179"))),
						new AdminSpecGroup("Processzor", List.of(
								new AdminSpecRow("Chip", "Apple A18")))));

		assertThat(actual).isEqualTo(expected);
		assertThat(actual.getVersion()).isEqualTo(0L);
		assertThat(actual.getStatus()).isEqualTo(AdminProductStatus.ACTIVE);
		assertThat(actual.getArchivedAt()).isNull();
	}

	// Fails if setArchivedAt/setUpdatedAt (AdminProductModels.java:127-128) or
	// status() (AdminProductModels.java:132-134) is removed.
	@Test
	void archivedProductDetailIsReadable() {
		OffsetDateTime archivedAt = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
		jdbc.update("update product set archived_at = ? where id = ?", archivedAt, NOKIA_ID);

		AdminProduct actual = service.detail(NOKIA_ID);

		assertThat(actual.getStatus()).isEqualTo(AdminProductStatus.ARCHIVED);
		assertThat(actual.getArchivedAt()).isEqualTo(archivedAt);
	}

	// Fails if the orElseThrow (AdminProductQueryService.java:76-79) is removed.
	@Test
	void unknownProductIsNotFoundWithItsId() {
		assertThatThrownBy(() -> service.detail(999_999L))
				.isInstanceOf(DomainException.class)
				.satisfies(e -> {
					DomainException domainException = (DomainException) e;
					assertThat(domainException.code()).isEqualTo(ErrorCode.NOT_FOUND);
					assertThat(domainException.params()).isEqualTo(Map.of("productId", 999_999L));
				});
	}

	// Fails if AdminProductQueryService.brands() (AdminProductQueryService.java:87-91)
	// is removed.
	@Test
	void brandsAreSortedAndIncludeArchived() {
		jdbc.update("update product set archived_at = ? where id = ?",
				OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS), NOKIA_ID);

		List<String> brands = service.brands();

		assertThat(brands).containsExactly("Apple", "Nokia", "Samsung");
	}
}
