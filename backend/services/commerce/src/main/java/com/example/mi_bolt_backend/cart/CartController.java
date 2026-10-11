package com.example.mi_bolt_backend.cart;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.CartApi;
import com.example.mi_bolt_backend.api.model.AddCartItemRequest;
import com.example.mi_bolt_backend.api.model.Cart;
import com.example.mi_bolt_backend.api.model.SetCartItemQuantityRequest;
import com.example.mi_bolt_backend.session.CurrentSession;
import com.example.mi_bolt_backend.session.ShopSession;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Cart HTTP entry point. Implements the generated {@link CartApi} with five
 * delegating methods; every rule lives in {@link CartService}, every error
 * body is built by {@code ProblemAdvice}. The session comes from the request
 * attribute the cookie filter set ({@link CurrentSession}); the injected
 * request is Spring's request-scoped proxy. The {@code ETag} mirrors the
 * session state version and {@code If-Match} is checked before every mutation
 * (docs/02-backend.md §5, decision 0011).
 */
@RestController
public class CartController implements CartApi {

	private final CartService cartService;
	private final HttpServletRequest request;

	public CartController(CartService cartService, HttpServletRequest request) {
		this.cartService = cartService;
		this.request = request;
	}

	@Override
	public ResponseEntity<Cart> getCart() {
		return respond(cartService.getCart(session()));
	}

	@Override
	public ResponseEntity<Cart> addCartItem(String ifMatch, AddCartItemRequest body) {
		ShopSession session = session();
		cartService.expectVersion(session, ifMatch);
		return respond(cartService.addItem(session, body.getVariantId(), body.getQuantity()));
	}

	@Override
	public ResponseEntity<Cart> clearCart(String ifMatch) {
		ShopSession session = session();
		cartService.expectVersion(session, ifMatch);
		return respond(cartService.clear(session));
	}

	@Override
	public ResponseEntity<Cart> setCartItemQuantity(String ifMatch, String variantId,
			SetCartItemQuantityRequest body) {
		ShopSession session = session();
		cartService.expectVersion(session, ifMatch);
		return respond(cartService.setQuantity(session, variantId, body.getQuantity()));
	}

	@Override
	public ResponseEntity<Cart> removeCartItem(String ifMatch, String variantId) {
		ShopSession session = session();
		cartService.expectVersion(session, ifMatch);
		return respond(cartService.removeItem(session, variantId));
	}

	private ShopSession session() {
		return CurrentSession.get(request);
	}

	private static ResponseEntity<Cart> respond(CartData.CartView view) {
		return ResponseEntity.ok()
				.cacheControl(CacheControl.noStore())
				.eTag("\"" + view.version() + "\"")
				.body(CartModels.toCart(view));
	}
}