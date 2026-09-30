package com.example.mi_bolt_backend.order;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import org.springframework.stereotype.Service;
import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.catalog.CatalogService;
import com.example.mi_bolt_backend.checkout.CheckoutDraftRepository;
import com.example.mi_bolt_backend.session.ShopSession;
import tools.jackson.databind.ObjectMapper;

/** Accepted commercial values stay visible during the unchanged card-payment round trip. */
@Service
public class PaymentSnapshotService {
	private static final Set<String> ACTIVE = Set.of("requires_action", "pending", "succeeded");
	private final PaymentIntentRepository intents;
	private final ShopOrderRepository orders;
	private final CheckoutDraftRepository drafts;
	private final ObjectMapper json;
	private final Clock clock;

	public PaymentSnapshotService(PaymentIntentRepository intents, ShopOrderRepository orders,
			CheckoutDraftRepository drafts, ObjectMapper json, Clock clock) {
		this.intents = intents;
		this.orders = orders;
		this.drafts = drafts;
		this.json = json;
		this.clock = clock;
	}

	public PaymentSnapshotData accepted(ShopSession session, Cart cart) {
		for (PaymentIntent intent : intents.findBySessionIdOrderByCreatedAtDesc(session.getId())) {
			if (!ACTIVE.contains(intent.getStatus()) || intent.getSnapshotJson() == null
					|| (!"succeeded".equals(intent.getStatus()) && !OffsetDateTime.now(clock).isBefore(intent.getExpiresAt()))
					|| orders.existsByPaymentIntentId(intent.getId())) {
				continue;
			}
			PaymentSnapshotData snapshot = json.readValue(intent.getSnapshotJson(), PaymentSnapshotData.class);
			if (snapshot.cart().id() == cart.getId() && snapshot.basketRevision() == cart.getBasketRevision()
					&& snapshot.cart().items().size() == cart.getItems().size()
					&& cart.getItems().stream().allMatch(item ->
						item.getQuantity() <= CatalogService.orderableMax(item.getVariant())
						&& snapshot.cart().items().stream().anyMatch(line ->
							line.variantId().equals(item.getVariant().getId()) && line.quantity() == item.getQuantity()))
					&& snapshot.draftUpdatedAt() != null
					&& drafts.findByCartId(cart.getId()).filter(draft ->
						draft.getRevision() == snapshot.draftRevision()
						&& draft.getUpdatedAt().toInstant().truncatedTo(ChronoUnit.MICROS)
							.equals(snapshot.draftUpdatedAt().toInstant().truncatedTo(ChronoUnit.MICROS))).isPresent()) {
				return snapshot;
			}
		}
		return null;
	}
}
