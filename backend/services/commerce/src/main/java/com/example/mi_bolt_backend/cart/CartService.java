package com.example.mi_bolt_backend.cart;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.catalog.CatalogService;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.session.SessionService;

/** Write-side service for the cart. See docs/02-backend.md §4.2, §4.6 and §5. */
@Service
@Transactional(noRollbackFor = DomainException.class)
public class CartService {

	private static final String N_ITEM_REMOVED = "ITEM_REMOVED";
	private static final String N_QUANTITY_REDUCED = "QUANTITY_REDUCED";
	private static final String N_PRICE_CHANGED = "PRICE_CHANGED";

	private final CartRepository carts;
	private final ProductVariantRepository variants;
	private final ShopSessionRepository sessions;
	private final SessionService sessionService;
	private final Clock clock;

	public CartService(CartRepository carts,
			ProductVariantRepository variants,
			ShopSessionRepository sessions,
			SessionService sessionService,
			Clock clock) {
		this.carts = carts;
		this.variants = variants;
		this.sessions = sessions;
		this.sessionService = sessionService;
		this.clock = clock;
	}

	public CartData.CartView getCart(ShopSession current) {
		ShopSession session = loadSession(current);
		Cart cart = loadOrCreateCart(session);
		expireIfPast(cart);
		ReconciliationResult result = reconcile(cart);
		return finalize(cart, session, result);
	}

	public void expectVersion(ShopSession current, String ifMatch) {
		ShopSession session = loadSession(current);
		String trimmed = ifMatch == null ? "" : ifMatch.trim();
		if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
			trimmed = trimmed.substring(1, trimmed.length() - 1);
		}
		long received;
		try {
			received = Long.parseLong(trimmed.trim());
		}
		catch (NumberFormatException e) {
			throw new DomainException(ErrorCode.CART_VERSION_CONFLICT, "version conflict",
					Map.of("expected", session.getStateVersion(), "received", 0L), null, e);
		}
		if (received != session.getStateVersion()) {
			throw new DomainException(ErrorCode.CART_VERSION_CONFLICT, "version conflict",
					Map.of("expected", session.getStateVersion(), "received", received));
		}
	}

	public CartData.CartView addItem(ShopSession current, String variantId, int quantity) {
		if (quantity < 1) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"quantity must be at least 1",
					Map.of("quantity", quantity));
		}
		ShopSession session = loadSession(current);
		Cart cart = loadOrCreateCart(session);
		expireIfPast(cart);
		ProductVariant variant = variants.findByIdWithDetails(variantId)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"variant not found",
						Map.of("variantId", variantId)));
		int max = CatalogService.orderableMax(variant);
		if (max == 0) {
			throw new DomainException(ErrorCode.OUT_OF_STOCK, "variant is out of stock",
					Map.of("variantId", variantId));
		}
		int existingQty = 0;
		CartItem line = findLine(cart, variantId);
		if (line != null) {
			existingQty = line.getQuantity();
		}
		int merged = existingQty + quantity;
		if (merged > max) {
			throw new DomainException(ErrorCode.QUANTITY_LIMIT, "quantity limit exceeded",
					Map.of("max", max, "requested", merged));
		}
		ReconciliationResult result = reconcile(cart);
		if (line == null) {
			line = new CartItem(cart, variant, merged, variant.getPriceHuf(), now());
			cart.getItems().add(line);
		}
		else {
			line.setQuantity(merged, now());
			line.setUnitPriceHuf(variant.getPriceHuf(), now());
		}
		result.markMutated();
		return finalize(cart, session, result);
	}

	public CartData.CartView setQuantity(ShopSession current, String variantId, int quantity) {
		if (quantity < 1) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"quantity must be at least 1",
					Map.of("quantity", quantity));
		}
		ShopSession session = loadSession(current);
		Cart cart = loadOrCreateCart(session);
		expireIfPast(cart);
		ProductVariant variant = variants.findByIdWithDetails(variantId)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"variant not found",
						Map.of("variantId", variantId)));
		int max = CatalogService.orderableMax(variant);
		if (quantity > max) {
			throw new DomainException(ErrorCode.QUANTITY_LIMIT, "quantity limit exceeded",
					Map.of("max", max, "requested", quantity));
		}
		CartItem line = findLine(cart, variantId);
		if (line == null) {
			throw new DomainException(ErrorCode.NOT_FOUND, "line not found",
					Map.of("variantId", variantId));
		}
		ReconciliationResult result = reconcile(cart);
		line.setQuantity(quantity, now());
		result.markMutated();
		return finalize(cart, session, result);
	}

	public CartData.CartView removeItem(ShopSession current, String variantId) {
		ShopSession session = loadSession(current);
		Cart cart = loadOrCreateCart(session);
		expireIfPast(cart);
		variants.findByIdWithDetails(variantId)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND,
						"variant not found",
						Map.of("variantId", variantId)));
		CartItem line = findLine(cart, variantId);
		ReconciliationResult result = reconcile(cart);
		if (line != null) {
			cart.getItems().remove(line);
			result.markMutated();
		}
		return finalize(cart, session, result);
	}

	public CartData.CartView clear(ShopSession current) {
		ShopSession session = loadSession(current);
		Cart cart = loadOrCreateCart(session);
		expireIfPast(cart);
		ReconciliationResult result = ReconciliationResult.empty();
		if (!cart.getItems().isEmpty()) {
			cart.getItems().clear();
			result.markMutated();
		}
		return finalize(cart, session, result);
	}

	private ShopSession loadSession(ShopSession current) {
		return sessions.findById(current.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "session not found"));
	}

	private Cart loadOrCreateCart(ShopSession session) {
		Optional<Cart> existing = carts.findBySessionIdWithItems(session.getId());
		if (existing.isPresent()) {
			return existing.get();
		}
		Cart created = new Cart(session, now(), now().plus(sessionService.lifetime()));
		return carts.save(created);
	}

	private void expireIfPast(Cart cart) {
		if (cart.getExpiresAt() != null && cart.getExpiresAt().isBefore(now())) {
			carts.delete(cart);
			throw new DomainException(ErrorCode.CART_EXPIRED, "cart expired");
		}
	}

	private CartItem findLine(Cart cart, String variantId) {
		for (CartItem item : cart.getItems()) {
			if (item.getVariant().getId().equals(variantId)) {
				return item;
			}
		}
		return null;
	}

	private ReconciliationResult reconcile(Cart cart) {
		ReconciliationResult result = ReconciliationResult.empty();
		Iterator<CartItem> iterator = cart.getItems().iterator();
		while (iterator.hasNext()) {
			CartItem item = iterator.next();
			ProductVariant variant = item.getVariant();
			int max = CatalogService.orderableMax(variant);
			int oldQty = item.getQuantity();
			long oldPrice = item.getUnitPriceHuf();
			if (max == 0) {
				iterator.remove();
				result.add(new CartData.Notice(N_ITEM_REMOVED, variant.getId(), variant.getProduct().getName(),
						new CartData.NoticeParams(oldQty, null, null)));
			}
			else {
				if (oldQty > max) {
					item.setQuantity(max, now());
					result.add(new CartData.Notice(N_QUANTITY_REDUCED, variant.getId(), variant.getProduct().getName(),
							new CartData.NoticeParams(null, oldQty, max)));
				}
				if (oldPrice != variant.getPriceHuf()) {
					item.setUnitPriceHuf(variant.getPriceHuf(), now());
					result.add(new CartData.Notice(N_PRICE_CHANGED, variant.getId(), variant.getProduct().getName(),
							new CartData.NoticeParams(null, Math.toIntExact(oldPrice), Math.toIntExact(variant.getPriceHuf()))));
				}
			}
		}
		return result;
	}

	private CartData.CartView finalize(Cart cart, ShopSession session, ReconciliationResult result) {
		if (result.noticeCount() > 0 || result.mutated()) {
			session.bumpStateVersion();
			session.extend(now(), now().plus(sessionService.lifetime()));
			cart.touch(now(), now().plus(sessionService.lifetime()));
		}
		List<CartData.Line> lines = new ArrayList<>();
		int totalQty = 0;
		long subtotal = 0L;
		for (CartItem item : cart.getItems()) {
			ProductVariant v = item.getVariant();
			int max = CatalogService.orderableMax(v);
			int qty = item.getQuantity();
			long unitPrice = item.getUnitPriceHuf();
			long lineTotal = (long) qty * unitPrice;
			CartData.Line line = new CartData.Line(
					v.getId(),
					v.getSlug(),
					String.valueOf(v.getProduct().getId()),
					v.getProduct().getSlug(),
					v.getProduct().getName(),
					v.getColor().getName(),
					v.getStorageGb(),
					CatalogService.toImageData(v.getColor()),
					qty,
					unitPrice,
					lineTotal,
					max > 0,
					max);
			lines.add(line);
			totalQty += qty;
			subtotal += lineTotal;
		}
		return new CartData.CartView(
				cart.getId(),
				session.getStateVersion(),
				lines,
				lines.size(),
				totalQty,
				subtotal,
				cart.getExpiresAt(),
				result.notices());
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
	}

	private static final class ReconciliationResult {
		private final List<CartData.Notice> notices = new ArrayList<>();
		private boolean mutated;

		static ReconciliationResult empty() {
			return new ReconciliationResult();
		}

		void add(CartData.Notice notice) {
			notices.add(notice);
		}

		int noticeCount() {
			return notices.size();
		}

		List<CartData.Notice> notices() {
			return List.copyOf(notices);
		}

		boolean mutated() {
			return mutated;
		}

		void markMutated() {
			this.mutated = true;
		}
	}
}
