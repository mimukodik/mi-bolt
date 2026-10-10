package com.example.mi_bolt_backend.catalog;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** Persisted singleton decoration settings; product promotions never write this row. */
@Entity
@Table(name = "halloween_appearance")
public class HalloweenAppearanceSettings {
	@Id
	private Long id = 1L;
	@Column(nullable = false)
	private boolean enabled;
	@Column(name = "starts_at")
	private OffsetDateTime startsAt;
	@Column(name = "ends_at")
	private OffsetDateTime endsAt;
	@Version
	@Column(nullable = false)
	private long version;

	public boolean isEnabled() { return enabled; }
	public OffsetDateTime getStartsAt() { return startsAt; }
	public OffsetDateTime getEndsAt() { return endsAt; }
	public long getVersion() { return version; }

	public void replace(boolean enabled, OffsetDateTime startsAt, OffsetDateTime endsAt) {
		this.enabled = enabled;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
	}
}
