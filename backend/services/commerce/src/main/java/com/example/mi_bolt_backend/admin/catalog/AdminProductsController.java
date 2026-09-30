package com.example.mi_bolt_backend.admin.catalog;

import java.net.URI;
import com.example.mi_bolt_backend.catalog.PromotionService;
import com.example.mi_bolt_backend.api.model.AdminPromotion;
import com.example.mi_bolt_backend.api.model.AdminPromotionInput;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.AdminProductsApi;
import com.example.mi_bolt_backend.api.model.AdminProduct;
import com.example.mi_bolt_backend.api.model.AdminProductInput;
import com.example.mi_bolt_backend.api.model.AdminProductPage;
import com.example.mi_bolt_backend.api.model.AdminProductSortField;
import com.example.mi_bolt_backend.api.model.AdminProductStatusFilter;
import com.example.mi_bolt_backend.api.model.SortDirection;

import jakarta.servlet.http.HttpServletRequest;

/** The AdminProducts operations; delegation only. */
@RestController
public class AdminProductsController implements AdminProductsApi {

	private final AdminProductQueryService adminProductQueryService;
	private final AdminProductCommandService adminProductCommandService;
	private final HttpServletRequest request;
	private final PromotionService promotions;

	public AdminProductsController(AdminProductQueryService adminProductQueryService,
			AdminProductCommandService adminProductCommandService,
			HttpServletRequest request, PromotionService promotions) {
		this.adminProductQueryService = adminProductQueryService;
		this.adminProductCommandService = adminProductCommandService;
		this.request = request;
		this.promotions = promotions;
	}

	@Override
	public ResponseEntity<AdminPromotion> getAdminPromotion() {
		AdminPromotion result = promotions.admin();
		return ResponseEntity.ok().eTag(AdminProductEtags.etag(result.getVersion())).body(result);
	}
	@Override
	public ResponseEntity<AdminPromotion> replaceAdminPromotion(AdminPromotionInput input, String ifMatch) {
		AdminPromotion result = promotions.replace(ifMatch, input);
		return ResponseEntity.ok().eTag(AdminProductEtags.etag(result.getVersion())).body(result);
	}

	@Override
	public ResponseEntity<AdminProductPage> listAdminProducts(String q, List<String> brand,
			AdminProductStatusFilter status, Boolean featured, Boolean outOfStock, AdminProductSortField sort,
			SortDirection direction, Integer page, Integer pageSize) {
		return ResponseEntity.ok(adminProductQueryService.list(new AdminProductListQuery(q, brand, status, featured,
				outOfStock, sort, direction, page, pageSize)));
	}

	@Override
	public ResponseEntity<AdminProduct> getAdminProduct(Long productId) {
		AdminProduct product = adminProductQueryService.detail(productId);
		return ResponseEntity.ok().eTag(AdminProductEtags.etag(product.getVersion())).body(product);
	}

	@Override
	public ResponseEntity<AdminProduct> createAdminProduct(AdminProductInput adminProductInput) {
		long id = adminProductCommandService.create(adminProductInput);
		AdminProduct product = adminProductQueryService.detail(id);
		return ResponseEntity.created(URI.create(request.getContextPath() + "/admin/products/" + id))
				.eTag(AdminProductEtags.etag(product.getVersion()))
				.body(product);
	}

	@Override
	public ResponseEntity<AdminProduct> replaceAdminProduct(Long productId, AdminProductInput adminProductInput,
			String ifMatch) {
		adminProductCommandService.replace(productId, ifMatch, adminProductInput);
		return current(productId);
	}

	@Override
	public ResponseEntity<AdminProduct> archiveAdminProduct(Long productId, String ifMatch) {
		adminProductCommandService.archive(productId, ifMatch);
		return current(productId);
	}

	@Override
	public ResponseEntity<AdminProduct> restoreAdminProduct(Long productId, String ifMatch) {
		adminProductCommandService.restore(productId, ifMatch);
		return current(productId);
	}

	@Override
	public ResponseEntity<List<String>> listAdminBrands() {
		return ResponseEntity.ok(adminProductQueryService.brands());
	}

	private ResponseEntity<AdminProduct> current(long productId) {
		AdminProduct product = adminProductQueryService.detail(productId);
		return ResponseEntity.ok().eTag(AdminProductEtags.etag(product.getVersion())).body(product);
	}
}
