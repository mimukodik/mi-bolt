package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManager;

@IntegrationTest
@Transactional
class OrderRepositoryTest {

	@Autowired
	private PaymentIntentRepository intents;

	@Autowired
	private ShopOrderRepository orders;

	@Autowired
	private IdempotencyRecordRepository idempotency;

	@Autowired
	private ProductVariantRepository variants;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private PlatformTransactionManager transactionManager;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void savesAnOrderWithLinesAndReadsItBackForItsSessionOnly() {
		OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
		ShopSession session = sessions.save(new ShopSession("hash-order-test", now, now.plusDays(30)));

		intents.save(new PaymentIntent(
				"pi-test-1",
				session,
				"succeeded",
				299_990L,
				"/demo-fizetes/pi-test-1",
				"/penztar?paymentIntentId=pi-test-1",
				now,
				now.plusMinutes(30)));

		ShopOrder order = new ShopOrder(
				"DEMO-000001",
				session,
				"confirmed",
				"card",
				"pi-test-1",
				299_990L,
				0L,
				0L,
				299_990L,
				"home_delivery",
				"HU",
				"1111",
				"Budapest",
				"Fő utca 1",
				"2. em.",
				"Anna Kovács",
				"HU",
				"1111",
				"Budapest",
				"Fő utca 1",
				null,
				"Anna Kovács",
				"anna@example.com",
				"+36301234567",
				"2026-09",
				"n",
				now);
		order.addLine(new OrderLine(
				order,
				0,
				"samsung-galaxy-s25--navy--128",
				"Samsung Galaxy S25",
				"Sötétkék",
				128,
				1,
				299_990L,
				299_990L));
		orders.save(order);
		entityManager.flush();
		entityManager.clear();

		ShopOrder loaded = orders
				.findByIdAndSessionIdWithLines(order.getId(), session.getId())
				.orElseThrow();
		assertThat(loaded.getOrderNumber()).isEqualTo("DEMO-000001");
		assertThat(loaded.getStatus()).isEqualTo("confirmed");
		assertThat(loaded.getPaymentMethod()).isEqualTo("card");
		assertThat(loaded.getPaymentIntentId()).isEqualTo("pi-test-1");
		assertThat(loaded.getSubtotalHuf()).isEqualTo(299_990L);
		assertThat(loaded.getShippingFeeHuf()).isEqualTo(0L);
		assertThat(loaded.getPaymentFeeHuf()).isEqualTo(0L);
		assertThat(loaded.getTotalHuf()).isEqualTo(299_990L);
		assertThat(loaded.getDeliveryOption()).isEqualTo("home_delivery");
		assertThat(loaded.getDeliveryCountryCode()).isEqualTo("HU");
		assertThat(loaded.getDeliveryPostalCode()).isEqualTo("1111");
		assertThat(loaded.getDeliveryCity()).isEqualTo("Budapest");
		assertThat(loaded.getDeliveryLine1()).isEqualTo("Fő utca 1");
		assertThat(loaded.getDeliveryLine2()).isEqualTo("2. em.");
		assertThat(loaded.getBillingName()).isEqualTo("Anna Kovács");
		assertThat(loaded.getBillingCountryCode()).isEqualTo("HU");
		assertThat(loaded.getBillingPostalCode()).isEqualTo("1111");
		assertThat(loaded.getBillingCity()).isEqualTo("Budapest");
		assertThat(loaded.getBillingLine1()).isEqualTo("Fő utca 1");
		assertThat(loaded.getBillingLine2()).isNull();
		assertThat(loaded.getContactFullName()).isEqualTo("Anna Kovács");
		assertThat(loaded.getContactEmail()).isEqualTo("anna@example.com");
		assertThat(loaded.getContactPhone()).isEqualTo("+36301234567");
		assertThat(loaded.getTermsVersion()).isEqualTo("2026-09");
		assertThat(loaded.getNotice()).isEqualTo("n");
		assertThat(loaded.getCreatedAt()).isEqualTo(now);
		assertThat(loaded.getSession().getId()).isEqualTo(session.getId());

		assertThat(loaded.getLines()).hasSize(1);
		OrderLine line = loaded.getLines().get(0);
		assertThat(line.getPosition()).isEqualTo(0);
		assertThat(line.getVariantId()).isEqualTo("samsung-galaxy-s25--navy--128");
		assertThat(line.getProductName()).isEqualTo("Samsung Galaxy S25");
		assertThat(line.getColorName()).isEqualTo("Sötétkék");
		assertThat(line.getStorageGb()).isEqualTo(128);
		assertThat(line.getQuantity()).isEqualTo(1);
		assertThat(line.getUnitPriceHuf()).isEqualTo(299_990L);
		assertThat(line.getLineTotalHuf()).isEqualTo(299_990L);

		assertThat(orders.findByIdAndSessionIdWithLines(order.getId(), session.getId() + 1)).isEmpty();

		assertThat(orders.existsByOrderNumber("DEMO-000001")).isTrue();
		assertThat(orders.existsByOrderNumber("DEMO-999999")).isFalse();

		PaymentIntent intent = intents
				.findByIdAndSessionId("pi-test-1", session.getId())
				.orElseThrow();
		assertThat(intent.getId()).isEqualTo("pi-test-1");
		assertThat(intent.getSession().getId()).isEqualTo(session.getId());
		assertThat(intent.getStatus()).isEqualTo("succeeded");
		assertThat(intent.getAmountHuf()).isEqualTo(299_990L);
		assertThat(intent.getRedirectUrl()).isEqualTo("/demo-fizetes/pi-test-1");
		assertThat(intent.getReturnUrl()).isEqualTo("/penztar?paymentIntentId=pi-test-1");
		assertThat(intent.getCreatedAt()).isEqualTo(now);
		assertThat(intent.getUpdatedAt()).isEqualTo(now);
		assertThat(intent.getExpiresAt()).isEqualTo(now.plusMinutes(30));
		assertThat(intents.findByIdAndSessionId("pi-test-1", session.getId() + 1)).isEmpty();

		OffsetDateTime later = now.plusMinutes(1);
		intent.setStatus("declined", later);
		entityManager.flush();
		entityManager.clear();

		PaymentIntent reloaded = intents
				.findByIdAndSessionId("pi-test-1", session.getId())
				.orElseThrow();
		assertThat(reloaded.getStatus()).isEqualTo("declined");
		assertThat(reloaded.getUpdatedAt()).isCloseTo(later, within(1, ChronoUnit.SECONDS));
	}

	@Test
	void idempotencyScopeIsUniquePerSessionMethodPathAndKey() {
		OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
		ShopSession session = sessions.save(new ShopSession("hash-idem-test", now, now.plusDays(30)));
		IdempotencyRecord first = new IdempotencyRecord(
				session, "POST", "/api/v1/orders", "key-a", "hash-a",
				201, "/orders/DEMO-000001", "{\"orderNumber\":\"DEMO-000001\"}", now);
		idempotency.saveAndFlush(first);
		entityManager.flush();
		entityManager.clear();

		IdempotencyRecord stored = idempotency
				.findBySessionIdAndMethodAndPathAndIdempotencyKey(
						session.getId(), "POST", "/api/v1/orders", "key-a")
				.orElseThrow();
		assertThat(stored.getId()).isNotNull();
		assertThat(stored.getSession().getId()).isEqualTo(session.getId());
		assertThat(stored.getMethod()).isEqualTo("POST");
		assertThat(stored.getPath()).isEqualTo("/api/v1/orders");
		assertThat(stored.getIdempotencyKey()).isEqualTo("key-a");
		assertThat(stored.getRequestHash()).isEqualTo("hash-a");
		assertThat(stored.getResponseStatus()).isEqualTo(201);
		assertThat(stored.getResponseLocation()).isEqualTo("/orders/DEMO-000001");
		assertThat(stored.getResponseBody()).isEqualTo("{\"orderNumber\":\"DEMO-000001\"}");
		assertThat(stored.getCreatedAt()).isEqualTo(now);

		IdempotencyRecord second = new IdempotencyRecord(
				session, "POST", "/api/v1/orders", "key-a", "hash-b",
				201, "/orders/DEMO-000002", "{\"orderNumber\":\"DEMO-000002\"}", now);
		// The constraint violation must happen in a separate transaction; otherwise the
		// outer @Transactional would be marked rollback-only and the assertions below
		// could not run against the persisted first row. The shared EntityManager
		// still holds the failed instance, so the persistence context is cleared
		// before any further query.
		TransactionTemplate independent = new TransactionTemplate(transactionManager);
		assertThatThrownBy(() -> independent.executeWithoutResult(
				status -> idempotency.saveAndFlush(second)))
				.isInstanceOf(DataIntegrityViolationException.class);
		entityManager.clear();

		assertThat(idempotency
				.findBySessionIdAndMethodAndPathAndIdempotencyKey(
						session.getId(), "POST", "/api/v1/orders", "key-a")
				.map(IdempotencyRecord::getRequestHash))
				.contains("hash-a");

		assertThat(idempotency
				.findBySessionIdAndMethodAndPathAndIdempotencyKey(
						session.getId(), "POST", "/api/v1/orders", "key-b"))
				.isEmpty();
	}

	@Test
	void responseBodyColumnIsVarchar20000NotNull() {
		// T11 (changeset 0006) pinned idempotency_record.response_body to
		// varchar(20000) on every database and removed @Lob from the entity, so
		// the Hibernate validate step at boot agrees with PostgreSQL too. Before
		// the fix the column was clob (H2 created a CLOB that matched; PostgreSQL
		// created text that did not, and Hibernate 5.6.2 expects oid for
		// @Lob String). H2 hides the bug entirely; this test reads the schema
		// directly so a regression that re-introduces the clob shape — or drops
		// the length — fails the build on every database.
		Map<String, Object> column = jdbc.queryForMap(
				"SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE"
						+ " FROM INFORMATION_SCHEMA.COLUMNS"
						+ " WHERE TABLE_NAME = 'idempotency_record' AND COLUMN_NAME = 'response_body'");

		// H2 in PostgreSQL mode reports DATA_TYPE as 'character varying' for
		// varchar and 'character large object' (clob) for clob. Both are case
		// folded; match with case insensitivity so the same assertion holds on
		// PostgreSQL, which reports 'character varying' / 'text'.
		assertThat(((String) column.get("DATA_TYPE")).toLowerCase(Locale.ROOT))
				.isEqualTo("character varying");
		assertThat(((Number) column.get("CHARACTER_MAXIMUM_LENGTH")).longValue()).isEqualTo(20000L);
		assertThat(column.get("IS_NULLABLE")).isEqualTo("NO");
	}

	@Test
	void decrementStockIsConditional() {
		assertThat(variants.decrementStock("samsung-galaxy-s25--navy-alt--256", 1)).isEqualTo(1);
		assertThat(variants.decrementStock("samsung-galaxy-s25--navy-alt--256", 1)).isEqualTo(0);
		entityManager.clear();
		assertThat(variants.findById("samsung-galaxy-s25--navy-alt--256").orElseThrow().getStock())
				.isEqualTo(0);
	}

	@Test
	void stockCannotGoBelowZeroAtTheDatabase() {
		assertThatThrownBy(() -> entityManager
				.createNativeQuery("update product_variant set stock = -1 where id = 'nokia-105--black--128'")
				.executeUpdate())
				.hasMessageMatching("(?i).*ck_product_variant_stock[\\s\\S]*");
	}
}
