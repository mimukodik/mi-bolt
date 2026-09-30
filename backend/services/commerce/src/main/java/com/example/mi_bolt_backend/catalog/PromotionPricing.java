package com.example.mi_bolt_backend.catalog;

import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import com.example.mi_bolt_backend.api.model.Promotion;

/** One campaign/time snapshot per HTTP request, shared by all price consumers. */
@Service
public class PromotionPricing {
	private static final String SNAPSHOT = PromotionPricing.class.getName();
	private final PromotionService promotions;
	public PromotionPricing(PromotionService promotions) { this.promotions = promotions; }
	public Promotion snapshot() {
		RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
		if (attributes == null) { return promotions.get(); }
		Promotion snapshot = (Promotion) attributes.getAttribute(SNAPSHOT, RequestAttributes.SCOPE_REQUEST);
		if (snapshot == null) {
			snapshot = promotions.get();
			attributes.setAttribute(SNAPSHOT, snapshot, RequestAttributes.SCOPE_REQUEST);
		}
		return snapshot;
	}
	public boolean isActive(ProductVariant variant) {
		return variant.getSalePriceHuf() != null
				&& variant.getSalePriceHuf() > 0 && variant.getSalePriceHuf() < variant.getPriceHuf()
				&& variant.getStock() != null && variant.getStock() > 0 && variant.getProduct().getArchivedAt() == null
				&& Boolean.TRUE.equals(snapshot().getActive());
	}
	public long effectivePrice(ProductVariant variant) { return isActive(variant) ? variant.getSalePriceHuf() : variant.getPriceHuf(); }
	public Integer originalPrice(ProductVariant variant) { return isActive(variant) ? Math.toIntExact(variant.getPriceHuf()) : null; }
	public Promotion promotion(ProductVariant variant) { return isActive(variant) ? snapshot() : null; }
}
