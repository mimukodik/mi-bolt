package com.example.mi_bolt_backend.catalog;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.CatalogApi;
import com.example.mi_bolt_backend.api.model.CatalogItem;
import com.example.mi_bolt_backend.api.model.Product;
import com.example.mi_bolt_backend.api.model.ProductPage;
import com.example.mi_bolt_backend.api.model.ProductSort;
import com.example.mi_bolt_backend.api.model.StorageGb;

/**
 * Catalogue HTTP entry point. Implements the generated {@link CatalogApi}
 * with three delegating methods; every business rule lives in
 * {@link CatalogService} and every error response is built by the project-wide
 * {@code ProblemAdvice}, so this class contains no logic of its own.
 *
 * <p>The service returns plain-data records (see {@link CatalogData}); this
 * controller hands each one to {@link CatalogModels} which constructs the
 * generated DTOs the contract requires. Every answer carries {@code Cache-Control: no-cache} (ADR 0018), so an admin change shows on the shop's next load.
 */
@RestController
public class ProductsController implements CatalogApi {

	private final CatalogService catalogService;

	public ProductsController(CatalogService catalogService) {
		this.catalogService = catalogService;
	}

	@Override
	public ResponseEntity<ProductPage> listProducts(String q,
			List<String> brand,
			List<StorageGb> storageGb,
			List<String> color,
			Integer minPrice,
			Integer maxPrice,
			Boolean inStock,
			Boolean is5g,
			Boolean featured,
			Boolean promotion,
			ProductSort sort,
			Integer page,
			Integer pageSize) {
		return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(CatalogModels.toProductPage(catalogService.listProducts(q, brand, storageGb, color,
				minPrice, maxPrice, inStock, is5g, featured, promotion, sort, page, pageSize)));
	}

	@Override
	public ResponseEntity<Product> getProduct(String slug) {
		return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(CatalogModels.toProduct(catalogService.getProduct(slug)));
	}

	@Override
	public ResponseEntity<List<CatalogItem>> listRelatedProducts(String slug) {
		List<CatalogData.CatalogItemData> items = catalogService.listRelatedProducts(slug);
		List<CatalogItem> mapped = new ArrayList<>();
		for (CatalogData.CatalogItemData item : items) {
			mapped.add(CatalogModels.toCatalogItem(item));
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(mapped);
	}
}
