package com.example.mi_bolt_backend.order;

import java.net.URI;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.OrdersApi;
import com.example.mi_bolt_backend.api.model.CardOrderRequest;
import com.example.mi_bolt_backend.api.model.CashOnDeliveryOrderRequest;
import com.example.mi_bolt_backend.api.model.OrderReceipt;
import com.example.mi_bolt_backend.api.model.OrderRequest;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.CurrentSession;
import com.example.mi_bolt_backend.session.ShopSession;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;

/**
 * HTTP entry point for {@code /orders*}. Implements the generated
 * {@link OrdersApi}; every rule lives in {@link OrderService}, every error
 * body is built by {@code ProblemAdvice}. Idempotency-Key replay runs before
 * the service so a retry after an uncertain response returns the original
 * receipt rather than a 412. The {@code @Transactional} on {@code createOrder} joins
 * {@code orderService.place} and the idempotency store into one transaction
 * (docs/02-backend.md rule 42).
 */
@RestController
public class OrdersController implements OrdersApi {

	private static final String METHOD = "POST";
	private static final String PATH = "/orders";

	private final OrderService orderService;
	private final IdempotencyService idempotency;
	private final ObjectMapper objectMapper;
	private final HttpServletRequest request;

	public OrdersController(OrderService orderService,
			IdempotencyService idempotency,
			ObjectMapper objectMapper,
			HttpServletRequest request) {
		this.orderService = orderService;
		this.idempotency = idempotency;
		this.objectMapper = objectMapper;
		this.request = request;
	}

	@Override
	@Transactional
	public ResponseEntity<OrderReceipt> createOrder(String ifMatch, String idempotencyKey, OrderRequest body) {
		ShopSession session = session();
		String fingerprint = idempotency.fingerprint(json(body));
		Optional<OrderData.StoredResponse> replay = idempotency.replay(session, METHOD, PATH,
				idempotencyKey, fingerprint);
		if (replay.isPresent()) {
			return replayed(replay.get(), OrderReceipt.class);
		}
		String paymentIntentId;
		String termsVersion;
		boolean acceptedTerms;
		if (body instanceof CardOrderRequest card) {
			paymentIntentId = card.getPaymentIntentId();
			termsVersion = card.getTermsVersion();
			acceptedTerms = card.getAcceptedTerms();
		}
		else if (body instanceof CashOnDeliveryOrderRequest cod) {
			paymentIntentId = null;
			termsVersion = cod.getTermsVersion();
			acceptedTerms = cod.getAcceptedTerms();
		}
		else {
			throw new DomainException(ErrorCode.INVALID_REQUEST, "unknown payment method");
		}
		OrderData.Receipt receipt = orderService.place(session, ifMatch,
				body.getPaymentMethod(), paymentIntentId, termsVersion, acceptedTerms);
		OrderReceipt mapped = OrderModels.toOrderReceipt(receipt);
		String location = request.getContextPath() + PATH + "/" + receipt.id();
		idempotency.store(session, METHOD, PATH, idempotencyKey, fingerprint,
				new OrderData.StoredResponse(201, location, json(mapped)));
		return ResponseEntity.created(URI.create(location)).body(mapped);
	}

	@Override
	public ResponseEntity<OrderReceipt> getOrder(String orderId) {
		return ResponseEntity.ok(OrderModels.toOrderReceipt(orderService.get(session(), orderId)));
	}

	private ShopSession session() {
		return CurrentSession.get(request);
	}

	private String json(Object o) {
		try {
			return objectMapper.writeValueAsString(o);
		}
		catch (JacksonException e) {
			throw new IllegalStateException("cannot serialise response", e);
		}
	}

	private <T> ResponseEntity<T> replayed(OrderData.StoredResponse stored, Class<T> type) {
		try {
			T body = objectMapper.readValue(stored.body(), type);
			return ResponseEntity.status(stored.status())
					.header(HttpHeaders.LOCATION, stored.location())
					.body(body);
		}
		catch (JacksonException e) {
			throw new IllegalStateException("cannot deserialise stored response", e);
		}
	}
}
