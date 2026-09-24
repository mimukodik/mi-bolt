package com.example.mi_bolt_backend.order;

import java.net.URI;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
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
 * receipt rather than a 412. {@code createOrder} runs its whole body,
 * {@code orderService.place} and the idempotency store together, inside a
 * {@link TransactionTemplate} (docs/02-backend.md rule 42) rather than under
 * {@code @Transactional}, so that a request whose drawn order number
 * collided with a concurrent order (MIM-403) can retry the whole transaction
 * with a freshly drawn number instead of committing a rollback-only one.
 * A violation of {@code uq_shop_order_payment_intent} ({@link PaymentIntentReuse})
 * is answered with 422 PAYMENT_REQUIRED instead: the intent already backs an
 * order.
 */
@RestController
public class OrdersController implements OrdersApi {

	/** MIM-403: at most three attempts before an order-number collision is rethrown. */
	private static final int MAX_ATTEMPTS = 3;

	private static final String METHOD = "POST";
	private static final String PATH = "/orders";

	private final OrderService orderService;
	private final IdempotencyService idempotency;
	private final ObjectMapper objectMapper;
	private final HttpServletRequest request;
	private final TransactionTemplate transactionTemplate;

	public OrdersController(OrderService orderService,
			IdempotencyService idempotency,
			ObjectMapper objectMapper,
			HttpServletRequest request,
			PlatformTransactionManager transactionManager) {
		this.orderService = orderService;
		this.idempotency = idempotency;
		this.objectMapper = objectMapper;
		this.request = request;
		this.transactionTemplate = new TransactionTemplate(transactionManager);
	}

	@Override
	public ResponseEntity<OrderReceipt> createOrder(String ifMatch, String idempotencyKey, OrderRequest body) {
		for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			try {
				return transactionTemplate.execute(status -> placeOrder(ifMatch, idempotencyKey, body));
			}
			catch (DataIntegrityViolationException e) {
				if (PaymentIntentReuse.isPaymentIntentReuse(e)) {
					throw new DomainException(ErrorCode.PAYMENT_REQUIRED,
							"The referenced payment intent already backs an order; a new card order needs a new payment",
							null, null, e);
				}
				if (attempt == MAX_ATTEMPTS || !OrderNumberConflict.isOrderNumberConflict(e)) {
					throw e;
				}
			}
		}
		throw new IllegalStateException("unreachable: createOrder retry loop exited without returning or throwing");
	}

	private ResponseEntity<OrderReceipt> placeOrder(String ifMatch, String idempotencyKey, OrderRequest body) {
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
