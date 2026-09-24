package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLIntegrityConstraintViolationException;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** {@link PaymentIntentReuse#isPaymentIntentReuse(Throwable)}. */
class PaymentIntentReuseTest {

	@Test
	void trueForThePaymentIntentConstraintLowerCase() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("unique index violation"),
						"uq_shop_order_payment_intent"));

		assertThat(PaymentIntentReuse.isPaymentIntentReuse(ex)).isTrue();
	}

	@Test
	void trueForThePaymentIntentConstraintUpperCaseAsH2Reports() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("unique index violation"),
						"UQ_SHOP_ORDER_PAYMENT_INTENT"));

		assertThat(PaymentIntentReuse.isPaymentIntentReuse(ex)).isTrue();
	}

	@Test
	void falseForTheOrderNumberConstraint() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("unique index violation"),
						"uq_shop_order_number"));

		assertThat(PaymentIntentReuse.isPaymentIntentReuse(ex)).isFalse();
	}

	@Test
	void falseForAnExceptionWithNoCause() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed");

		assertThat(PaymentIntentReuse.isPaymentIntentReuse(ex)).isFalse();
	}
}
