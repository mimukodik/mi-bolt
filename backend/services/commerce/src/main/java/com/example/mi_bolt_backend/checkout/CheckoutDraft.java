package com.example.mi_bolt_backend.checkout;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import com.example.mi_bolt_backend.cart.Cart;

/** One checkout draft per cart; sections are nullable column groups (docs/02-backend.md §4.3). */
@Entity
@Table(name = "checkout_draft")
public class CheckoutDraft {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "cart_id", nullable = false, unique = true)
	private Cart cart;

	@Column(name = "contact_full_name")
	private String contactFullName;
	@Column(name = "contact_email")
	private String contactEmail;
	@Column(name = "contact_phone")
	private String contactPhone;

	@Column(name = "billing_name")
	private String billingName;
	@Column(name = "billing_country_code")
	private String billingCountryCode;
	@Column(name = "billing_postal_code")
	private String billingPostalCode;
	@Column(name = "billing_city")
	private String billingCity;
	@Column(name = "billing_line1")
	private String billingLine1;
	@Column(name = "billing_line2")
	private String billingLine2;

	@Column(name = "delivery_option")
	private String deliveryOption;
	@Column(name = "delivery_country_code")
	private String deliveryCountryCode;
	@Column(name = "delivery_postal_code")
	private String deliveryPostalCode;
	@Column(name = "delivery_city")
	private String deliveryCity;
	@Column(name = "delivery_line1")
	private String deliveryLine1;
	@Column(name = "delivery_line2")
	private String deliveryLine2;

	@Column(name = "payment_method")
	private String paymentMethod;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "revision", nullable = false)
	private long revision;

	protected CheckoutDraft() {
		// JPA requires a no-arg constructor.
	}

	public CheckoutDraft(Cart cart, OffsetDateTime now) {
		this.cart = cart;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public Long getId() {
		return id;
	}

	public Cart getCart() {
		return cart;
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

	public String getPaymentMethod() {
		return paymentMethod;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public long getRevision() {
		return revision;
	}

	public void setContact(String fullName, String email, String phone, OffsetDateTime now) {
		this.revision++;
		this.contactFullName = fullName;
		this.contactEmail = email;
		this.contactPhone = phone;
		this.updatedAt = now;
	}

	public void setBilling(String name, String countryCode, String postalCode, String city,
			String line1, String line2, OffsetDateTime now) {
		this.revision++;
		this.billingName = name;
		this.billingCountryCode = countryCode;
		this.billingPostalCode = postalCode;
		this.billingCity = city;
		this.billingLine1 = line1;
		this.billingLine2 = line2;
		this.updatedAt = now;
	}

	/** Pickup: pass null for every address argument (rule 27). */
	public void setDelivery(String option, String countryCode, String postalCode, String city,
			String line1, String line2, OffsetDateTime now) {
		this.revision++;
		this.deliveryOption = option;
		this.deliveryCountryCode = countryCode;
		this.deliveryPostalCode = postalCode;
		this.deliveryCity = city;
		this.deliveryLine1 = line1;
		this.deliveryLine2 = line2;
		this.updatedAt = now;
	}

	public void setPayment(String method, OffsetDateTime now) {
		this.revision++;
		this.paymentMethod = method;
		this.updatedAt = now;
	}
}
