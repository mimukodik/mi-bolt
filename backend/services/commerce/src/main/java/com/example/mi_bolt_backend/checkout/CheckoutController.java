package com.example.mi_bolt_backend.checkout;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.CheckoutApi;
import com.example.mi_bolt_backend.api.model.CheckoutOptions;
import com.example.mi_bolt_backend.api.model.CheckoutSession;
import com.example.mi_bolt_backend.api.model.UpdateCheckoutRequest;
import com.example.mi_bolt_backend.session.CurrentSession;
import com.example.mi_bolt_backend.session.ShopSession;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Checkout HTTP entry point. Implements the generated {@link CheckoutApi} with three
 * delegating methods; every rule lives in {@link CheckoutService}, every error body
 * is built by {@code ProblemAdvice}. The session comes from the request attribute the
 * cookie filter set ({@link CurrentSession}); the injected request is Spring's
 * request-scoped proxy. The {@code ETag} mirrors the session state version and
 * {@code If-Match} is checked before every mutation (docs/02-backend.md §4.3,
 * decision 0010).
 */
@RestController
public class CheckoutController implements CheckoutApi {

	private final CheckoutService checkoutService;
	private final HttpServletRequest request;

	public CheckoutController(CheckoutService checkoutService, HttpServletRequest request) {
		this.checkoutService = checkoutService;
		this.request = request;
	}

	@Override
	public ResponseEntity<CheckoutOptions> getCheckoutOptions() {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(CheckoutModels.toOptions(checkoutService.getOptions(session())));
	}

	@Override
	public ResponseEntity<CheckoutSession> getCheckout() {
		return respond(checkoutService.getCheckout(session()));
	}

	@Override
	public ResponseEntity<CheckoutSession> updateCheckout(String ifMatch, UpdateCheckoutRequest body) {
		ShopSession session = session();
		checkoutService.expectVersion(session, ifMatch);
		return respond(checkoutService.update(session, CheckoutModels.toUpdate(body)));
	}

	private ShopSession session() {
		return CurrentSession.get(request);
	}

	private static ResponseEntity<CheckoutSession> respond(CheckoutData.Session view) {
		return ResponseEntity.ok()
				.cacheControl(CacheControl.noStore())
				.eTag("\"" + view.version() + "\"")
				.body(CheckoutModels.toCheckoutSession(view));
	}
}