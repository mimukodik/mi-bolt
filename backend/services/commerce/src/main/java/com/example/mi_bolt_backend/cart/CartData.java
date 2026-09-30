package com.example.mi_bolt_backend.cart;

import java.time.OffsetDateTime;
import java.util.List;

import com.example.mi_bolt_backend.catalog.CatalogData;

/** Plain-data view of a cart; the mapper in T5-2 turns it into the generated DTOs. */
public interface CartData {

	record CartView(
			long id,
			long version,
			List<Line> items,
			int lineCount,
			int totalQuantity,
			long subtotal,
			OffsetDateTime expiresAt,
			List<Notice> notices, long basketRevision) {
		public CartView(long id, long version, List<Line> items, int lineCount, int totalQuantity,
				long subtotal, OffsetDateTime expiresAt, List<Notice> notices) {
			this(id, version, items, lineCount, totalQuantity, subtotal, expiresAt, notices, 0L);
		}
	}

	record Line(
			String variantId,
			String variantSlug,
			String productId,
			String productSlug,
			String productName,
			String colorName,
			int storageGb,
			CatalogData.ImageData image,
			int quantity,
			long unitPrice,
			long lineTotal,
			boolean inStock,
			int maxQuantity) {
	}

	record Notice(String code, String variantId, String productName, NoticeParams params) {
	}

	/** What a notice changed: {@code quantity} on ITEM_REMOVED, {@code from} and {@code to} on the other codes. */
	record NoticeParams(Integer quantity, Integer from, Integer to) {
	}
}
