package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLIntegrityConstraintViolationException;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** MIM-403: {@link OrderNumberConflict#isOrderNumberConflict(Throwable)}. */
class OrderNumberConflictTest {

	@Test
	void trueForTheOrderNumberConstraintLowerCase() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("unique index violation"),
						"uq_shop_order_number"));

		assertThat(OrderNumberConflict.isOrderNumberConflict(ex)).isTrue();
	}

	@Test
	void trueForTheOrderNumberConstraintUpperCaseAsH2Reports() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("unique index violation"),
						"UQ_SHOP_ORDER_NUMBER"));

		assertThat(OrderNumberConflict.isOrderNumberConflict(ex)).isTrue();
	}

	@Test
	void falseForAnotherConstraintName() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed",
				new ConstraintViolationException("constraint violation",
						new SQLIntegrityConstraintViolationException("not null violation"),
						"fk_shop_order_session"));

		assertThat(OrderNumberConflict.isOrderNumberConflict(ex)).isFalse();
	}

	@Test
	void falseForAnExceptionWithNoCause() {
		DataIntegrityViolationException ex = new DataIntegrityViolationException("insert failed");

		assertThat(OrderNumberConflict.isOrderNumberConflict(ex)).isFalse();
	}
}
