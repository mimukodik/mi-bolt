package com.example.mi_bolt_backend.admin.catalog;

import java.util.List;

import com.example.mi_bolt_backend.api.model.AdminProductSortField;
import com.example.mi_bolt_backend.api.model.AdminProductStatusFilter;
import com.example.mi_bolt_backend.api.model.SortDirection;

/**
 * Carries exactly the {@code GET /admin/products} controller's query
 * parameters into {@link AdminProductQueryService#list(AdminProductListQuery)}.
 */
public record AdminProductListQuery(
		String q,
		List<String> brand,
		AdminProductStatusFilter status,
		Boolean featured,
		Boolean outOfStock,
		AdminProductSortField sort,
		SortDirection direction,
		int page,
		int pageSize) {
}
