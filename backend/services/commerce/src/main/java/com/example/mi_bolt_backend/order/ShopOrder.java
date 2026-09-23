package com.example.mi_bolt_backend.order;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.example.mi_bolt_backend.session.ShopSession;

/** Confirmed order (docs/02-backend.md §4.5 rules 35–46). */
@Entity
@Table(name = "shop_order")
public class ShopOrder {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "order_number", nullable = false, length = 11)
	private String orderNumber;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private ShopSession session;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "payment_method", nullable = false, length = 20)
	private String paymentMethod;

	@Column(name = "payment_intent_id", length = 36)
	private String paymentIntentId;

	@Column(name = "subtotal_huf", nullable = false)
	private long subtotalHuf;

	@Column(name = "shipping_fee_huf", nullable = false)
	private long shippingFeeHuf;

	@Column(name = "payment_fee_huf", nullable = false)
	private long paymentFeeHuf;

	@Column(name = "total_huf", nullable = false)
	private long totalHuf;

	@Column(name = "delivery_option", nullable = false, length = 20)
	private String deliveryOption;

	@Column(name = "delivery_country_code", length = 2)
	private String deliveryCountryCode;
	@Column(name = "delivery_postal_code", length = 4)
	private String deliveryPostalCode;
	@Column(name = "delivery_city", length = 80)
	private String deliveryCity;
	@Column(name = "delivery_line1", length = 120)
	private String deliveryLine1;
	@Column(name = "delivery_line2", length = 120)
	private String deliveryLine2;

	@Column(name = "billing_name", nullable = false, length = 100)
	private String billingName;
	@Column(name = "billing_country_code", nullable = false, length = 2)
	private String billingCountryCode;
	@Column(name = "billing_postal_code", nullable = false, length = 4)
	private String billingPostalCode;
	@Column(name = "billing_city", nullable = false, length = 80)
	private String billingCity;
	@Column(name = "billing_line1", nullable = false, length = 120)
	private String billingLine1;
	@Column(name = "billing_line2", length = 120)
	private String billingLine2;

	@Column(name = "contact_full_name", nullable = false, length = 100)
	private String contactFullName;
	@Column(name = "contact_email", nullable = false, length = 254)
	private String contactEmail;
	@Column(name = "contact_phone", nullable = false, length = 16)
	private String contactPhone;

	@Column(name = "terms_version", nullable = false, length = 20)
	private String termsVersion;

	@Column(nullable = false, length = 300)
	private String notice;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("position")
	private List<OrderLine> lines = new ArrayList<>();

	protected ShopOrder() {
		// JPA requires a no-arg constructor.
	}

	public ShopOrder(String orderNumber, ShopSession session, String status, String paymentMethod,
			String paymentIntentId, long subtotalHuf, long shippingFeeHuf, long paymentFeeHuf,
			long totalHuf, String deliveryOption, String deliveryCountryCode, String deliveryPostalCode,
			String deliveryCity, String deliveryLine1, String deliveryLine2, String billingName,
			String billingCountryCode, String billingPostalCode, String billingCity, String billingLine1,
			String billingLine2, String contactFullName, String contactEmail, String contactPhone,
			String termsVersion, String notice, OffsetDateTime createdAt) {
		this.orderNumber = orderNumber;
		this.session = session;
		this.status = status;
		this.paymentMethod = paymentMethod;
		this.paymentIntentId = paymentIntentId;
		this.subtotalHuf = subtotalHuf;
		this.shippingFeeHuf = shippingFeeHuf;
		this.paymentFeeHuf = paymentFeeHuf;
		this.totalHuf = totalHuf;
		this.deliveryOption = deliveryOption;
		this.deliveryCountryCode = deliveryCountryCode;
		this.deliveryPostalCode = deliveryPostalCode;
		this.deliveryCity = deliveryCity;
		this.deliveryLine1 = deliveryLine1;
		this.deliveryLine2 = deliveryLine2;
		this.billingName = billingName;
		this.billingCountryCode = billingCountryCode;
		this.billingPostalCode = billingPostalCode;
		this.billingCity = billingCity;
		this.billingLine1 = billingLine1;
		this.billingLine2 = billingLine2;
		this.contactFullName = contactFullName;
		this.contactEmail = contactEmail;
		this.contactPhone = contactPhone;
		this.termsVersion = termsVersion;
		this.notice = notice;
		this.createdAt = createdAt;
	}

	public Long getId() {
		return id;
	}

	public String getOrderNumber() {
		return orderNumber;
	}

	public ShopSession getSession() {
		return session;
	}

	public String getStatus() {
		return status;
	}

	public String getPaymentMethod() {
		return paymentMethod;
	}

	public String getPaymentIntentId() {
		return paymentIntentId;
	}

	public long getSubtotalHuf() {
		return subtotalHuf;
	}

	public long getShippingFeeHuf() {
		return shippingFeeHuf;
	}

	public long getPaymentFeeHuf() {
		return paymentFeeHuf;
	}

	public long getTotalHuf() {
		return totalHuf;
	}

	public String getDeliveryOption() {
		return deliveryOption;
	}

	public String getDeliveryCountryCode() {
		return deliveryCountryCode;
	}

	public String getDeliveryPostalCode() {
		return deliveryPostalCode;
	}

	public String getDeliveryCity() {
		return deliveryCity;
	}

	public String getDeliveryLine1() {
		return deliveryLine1;
	}

	public String getDeliveryLine2() {
		return deliveryLine2;
	}

	public String getBillingName() {
		return billingName;
	}

	public String getBillingCountryCode() {
		return billingCountryCode;
	}

	public String getBillingPostalCode() {
		return billingPostalCode;
	}

	public String getBillingCity() {
		return billingCity;
	}

	public String getBillingLine1() {
		return billingLine1;
	}

	public String getBillingLine2() {
		return billingLine2;
	}

	public String getContactFullName() {
		return contactFullName;
	}

	public String getContactEmail() {
		return contactEmail;
	}

	public String getContactPhone() {
		return contactPhone;
	}

	public String getTermsVersion() {
		return termsVersion;
	}

	public String getNotice() {
		return notice;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public List<OrderLine> getLines() {
		return Collections.unmodifiableList(lines);
	}

	/** Keep the {@code order} side of the bidirectional relation in sync (rule 44). */
	public void addLine(OrderLine line) {
		lines.add(line);
	}
}
