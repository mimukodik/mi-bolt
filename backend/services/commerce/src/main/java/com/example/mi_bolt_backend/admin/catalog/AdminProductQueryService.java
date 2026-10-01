package com.example.mi_bolt_backend.admin.catalog;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.AdminProduct;
import com.example.mi_bolt_backend.api.model.AdminProductListItem;
import com.example.mi_bolt_backend.api.model.AdminProductPage;
import com.example.mi_bolt_backend.api.model.AdminProductStatusFilter;
import com.example.mi_bolt_backend.api.model.SortDirection;
import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.SmokeCanaryBootstrap;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * Read-side service for the admin product API: every product, archived
 * ones included, filtered, sorted, paged and mapped onto the generated DTOs
 * by {@link AdminProductModels}. The shape mirrors
 * {@code catalog.CatalogService}, but the admin list never drops archived
 * rows and its search/sort/paging rules are its own (docs/decisions/0019).
 */
@Service
@Transactional(readOnly = true)
public class AdminProductQueryService {

	private final AdminProductRepository adminProductRepository;

	public AdminProductQueryService(AdminProductRepository adminProductRepository) {
		this.adminProductRepository = adminProductRepository;
	}

	public AdminProductPage list(AdminProductListQuery query) {
		List<Product> products = adminProductRepository.findAllWithColors();
		adminProductRepository.fetchVariants(products);

		String normalizedQ = normalizeQ(query.q());

		List<Product> filtered = new ArrayList<>();
		for (Product p : products) {
			if (matchesStatus(p, query.status())
					&& matchesQ(p, normalizedQ)
					&& matchesBrand(p, query.brand())
					&& matchesFeatured(p, query.featured())
					&& matchesOutOfStock(p, query.outOfStock())) {
				filtered.add(p);
			}
		}
		filtered.sort(comparator(query));

		int totalElements = filtered.size();
		int totalPages = totalElements == 0 ? 0 : (totalElements + query.pageSize() - 1) / query.pageSize();

		List<AdminProductListItem> items = new ArrayList<>();
		long fromIndex = (long) (query.page() - 1) * query.pageSize();
		if (fromIndex < totalElements) {
			int from = (int) fromIndex;
			int to = Math.min(from + query.pageSize(), totalElements);
			for (Product p : filtered.subList(from, to)) {
				items.add(AdminProductModels.toListItem(p));
			}
		}

		return new AdminProductPage(items, totalElements, query.page(), query.pageSize(), totalPages);
	}

	public AdminProduct detail(long productId) {
		Product p = adminProductRepository.findById(productId)
				.filter(product -> !SmokeCanaryBootstrap.PRODUCT_SLUG.equals(product.getSlug()))
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"Product not found",
						Map.of("productId", productId)));
		adminProductRepository.fetchColors(List.of(p));
		adminProductRepository.fetchHighlights(List.of(p));
		adminProductRepository.fetchVariants(List.of(p));
		adminProductRepository.fetchSpecGroups(List.of(p));
		return AdminProductModels.toDetail(p);
	}

	public List<String> brands() {
		List<String> brands = new ArrayList<>(adminProductRepository.findDistinctBrands());
		brands.sort(String.CASE_INSENSITIVE_ORDER);
		return brands;
	}

	private static boolean matchesStatus(Product p, AdminProductStatusFilter status) {
		return switch (status) {
			case ACTIVE -> p.getArchivedAt() == null;
			case ARCHIVED -> p.getArchivedAt() != null;
			case ALL -> true;
		};
	}

	private static String normalizeQ(String q) {
		if (q == null) {
			return null;
		}
		String trimmed = q.trim();
		if (trimmed.isEmpty()) {
			return null;
		}
		return Normalizer.normalize(trimmed, Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
	}

	private static boolean matchesQ(Product p, String normalizedQ) {
		if (normalizedQ == null) {
			return true;
		}
		String haystack = Normalizer.normalize(
						p.getBrand() + " " + p.getName() + " " + p.getSlug(), Normalizer.Form.NFC)
				.toLowerCase(Locale.ROOT);
		return haystack.contains(normalizedQ);
	}

	private static boolean matchesBrand(Product p, List<String> brand) {
		return brand == null || brand.isEmpty() || brand.contains(p.getBrand());
	}

	private static boolean matchesFeatured(Product p, Boolean featured) {
		return featured == null || p.isFeatured() == featured.booleanValue();
	}

	private static boolean matchesOutOfStock(Product p, Boolean outOfStock) {
		if (outOfStock == null) {
			return true;
		}
		int total = totalStock(p);
		return outOfStock.booleanValue() ? total == 0 : total > 0;
	}

	private static int totalStock(Product p) {
		int total = 0;
		for (ProductVariant v : p.getVariants()) {
			Integer stock = v.getStock();
			total += stock == null ? 0 : stock;
		}
		return total;
	}

	private static Long minVariantPrice(Product p) {
		Long min = null;
		for (ProductVariant v : p.getVariants()) {
			long price = v.getPriceHuf();
			if (min == null || price < min) {
				min = price;
			}
		}
		return min;
	}

	private static Comparator<Product> comparator(AdminProductListQuery query) {
		Comparator<Product> primary = switch (query.sort()) {
			case RANK -> byKey(Product::getRank, Comparator.naturalOrder(), query.direction());
			case NAME -> byKey(Product::getName, String.CASE_INSENSITIVE_ORDER, query.direction());
			case BRAND -> byKey(Product::getBrand, String.CASE_INSENSITIVE_ORDER, query.direction());
			case RELEASED_AT -> byKey(Product::getReleasedAt, Comparator.naturalOrder(), query.direction());
			case MIN_PRICE -> byKey(AdminProductQueryService::minVariantPrice, Comparator.naturalOrder(), query.direction());
			case TOTAL_STOCK -> byKey(AdminProductQueryService::totalStock, Comparator.naturalOrder(), query.direction());
			case FEATURED -> byKey(Product::isFeatured, Comparator.naturalOrder(), query.direction());
		};
		return primary.thenComparing(Product::getId);
	}

	/**
	 * Builds a comparator on one sort key: {@code direction} reverses only the
	 * ordering of non-null values, never where a {@code null} key sorts (always
	 * last), so the caller's {@code thenComparing(Product::getId)} tie-break
	 * stays ascending regardless of direction.
	 */
	private static <T> Comparator<Product> byKey(
			Function<Product, T> keyExtractor, Comparator<T> naturalOrder, SortDirection direction) {
		Comparator<T> valueOrder = direction == SortDirection.DESC ? naturalOrder.reversed() : naturalOrder;
		return Comparator.comparing(keyExtractor, Comparator.nullsLast(valueOrder));
	}
}
