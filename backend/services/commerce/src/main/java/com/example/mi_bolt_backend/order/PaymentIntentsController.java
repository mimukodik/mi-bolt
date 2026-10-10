package com.example.mi_bolt_backend.order;

import java.net.URI;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.PaymentApi;
import com.example.mi_bolt_backend.api.model.PaymentIntent;
import com.example.mi_bolt_backend.api.model.CreatePaymentIntentRequest;
import com.example.mi_bolt_backend.api.model.PaymentOutcomeRequest;
import com.example.mi_bolt_backend.session.CurrentSession;
import com.example.mi_bolt_backend.session.ShopSession;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;

/**
 * HTTP entry point for {@code /payment-intents*}. Implements the generated
 * {@link PaymentApi}; every rule lives in {@link PaymentIntentService},
 * every error body is built by {@code ProblemAdvice}. Idempotency-Key replay
 * runs before the service so a retry after an uncertain response returns the
 * original receipt rather than starting a second authorisation. The
 * {@code @Transactional} on {@code createPaymentIntent} joins {@code intentService.create} and
 * the idempotency store into one transaction (docs/02-backend.md rule 42).
 */
@RestController
public class PaymentIntentsController implements PaymentApi {

	private static final String METHOD = "POST";
	private static final String PATH = "/payment-intents";
	private static final String EMPTY_BODY = "";

	private final PaymentIntentService intentService;
	private final IdempotencyService idempotency;
	private final ObjectMapper objectMapper;
	private final HttpServletRequest request;

	public PaymentIntentsController(PaymentIntentService intentService,
			IdempotencyService idempotency,
			ObjectMapper objectMapper,
			HttpServletRequest request) {
		this.intentService = intentService;
		this.idempotency = idempotency;
		this.objectMapper = objectMapper;
		this.request = request;
	}

	@Override
	@Transactional
	public ResponseEntity<PaymentIntent> createPaymentIntent(String ifMatch, String idempotencyKey, CreatePaymentIntentRequest acceptance) {
		ShopSession session = session();
		String fingerprint = idempotency.fingerprint(acceptance == null ? EMPTY_BODY : json(acceptance));
		Optional<OrderData.StoredResponse> replay = idempotency.replay(session, METHOD, PATH,
				idempotencyKey, fingerprint);
		if (replay.isPresent()) {
			return replayed(replay.get(), PaymentIntent.class);
		}
		OrderData.IntentView view = intentService.create(session, ifMatch, acceptance == null ? null : acceptance.getAcceptedPriceRevision());
		PaymentIntent body = OrderModels.toPaymentIntent(view);
		String location = request.getContextPath() + PATH + "/" + view.id();
		idempotency.store(session, METHOD, PATH, idempotencyKey, fingerprint,
				new OrderData.StoredResponse(201, location, json(body)));
		return ResponseEntity.created(URI.create(location)).body(body);
	}

	@Override
	public ResponseEntity<PaymentIntent> getPaymentIntent(String paymentIntentId) {
		return ResponseEntity.ok(OrderModels.toPaymentIntent(intentService.get(session(), paymentIntentId)));
	}

	@Override
	public ResponseEntity<PaymentIntent> resolvePaymentIntent(String paymentIntentId,
			PaymentOutcomeRequest body) {
		return ResponseEntity.ok(OrderModels.toPaymentIntent(
				intentService.resolve(session(), paymentIntentId, body.getOutcome().getValue())));
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
